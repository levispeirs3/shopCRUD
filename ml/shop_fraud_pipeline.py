from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import warnings
from datetime import datetime, timezone
from typing import Tuple

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import precision_score, recall_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

warnings.filterwarnings("ignore")

FRAUD_THRESHOLD = 0.22462698129859973

BASE_SQL = """
WITH item_agg AS (
    SELECT
        oi.order_id,
        COUNT(*) AS line_count,
        SUM(oi.quantity) AS total_quantity,
        SUM(oi.line_total) AS item_line_total,
        AVG(oi.unit_price) AS avg_unit_price,
        MAX(oi.unit_price) AS max_unit_price,
        COUNT(DISTINCT oi.product_id) AS distinct_products
    FROM order_items oi
    GROUP BY oi.order_id
)
SELECT
    o.order_id,
    o.customer_id,
    o.order_datetime,
    o.billing_zip,
    o.shipping_zip,
    o.shipping_state,
    o.payment_method,
    o.device_type,
    o.ip_country,
    o.promo_used,
    o.order_subtotal,
    o.shipping_fee,
    o.tax_amount,
    o.order_total,
    o.risk_score,
    o.is_fraud,
    c.gender,
    c.birthdate,
    c.created_at AS customer_created_at,
    c.city,
    c.state AS customer_state,
    c.customer_segment,
    c.loyalty_tier,
    c.is_active,
    s.carrier,
    s.shipping_method,
    s.distance_band,
    s.promised_days,
    s.actual_days,
    s.late_delivery,
    ia.line_count,
    ia.total_quantity,
    ia.item_line_total,
    ia.avg_unit_price,
    ia.max_unit_price,
    ia.distinct_products
FROM orders o
LEFT JOIN customers c ON o.customer_id = c.customer_id
LEFT JOIN shipments s ON o.order_id = s.order_id
LEFT JOIN item_agg ia ON o.order_id = ia.order_id
"""

DROP_COLS = [
    "order_id",
    "customer_id",
    "order_datetime",
    "birthdate",
    "customer_created_at",
    "pay_dev_ctry",
]


def build_features(raw: pd.DataFrame) -> pd.DataFrame:
    data = raw.copy()

    dt_cols = ["order_datetime", "customer_created_at", "birthdate"]
    for col in dt_cols:
        data[col] = pd.to_datetime(data[col], errors="coerce")

    data["order_hour"] = data["order_datetime"].dt.hour
    data["order_dayofweek"] = data["order_datetime"].dt.dayofweek
    data["order_month"] = data["order_datetime"].dt.month
    data["is_weekend_order"] = data["order_dayofweek"].isin([5, 6]).astype(int)

    data["customer_tenure_days"] = (data["order_datetime"] - data["customer_created_at"]).dt.days
    data["customer_age_years"] = (data["order_datetime"] - data["birthdate"]).dt.days / 365.25

    data["zip_mismatch"] = (
        data["billing_zip"].fillna("").astype(str).str[:5] != data["shipping_zip"].fillna("").astype(str).str[:5]
    ).astype(int)
    data["state_mismatch"] = (
        data["shipping_state"].fillna("").astype(str) != data["customer_state"].fillna("").astype(str)
    ).astype(int)

    data["shipping_to_subtotal_ratio"] = data["shipping_fee"] / data["order_subtotal"].replace(0, np.nan)
    data["tax_to_subtotal_ratio"] = data["tax_amount"] / data["order_subtotal"].replace(0, np.nan)
    data["avg_item_value_proxy"] = data["order_subtotal"] / data["total_quantity"].replace(0, np.nan)

    high_ticket_cutoff = pd.to_numeric(data["order_total"], errors="coerce").quantile(0.90)
    data["high_ticket_order"] = (pd.to_numeric(data["order_total"], errors="coerce") > high_ticket_cutoff).astype(int)

    data["shipping_delay_days"] = data["actual_days"] - data["promised_days"]

    data = data.sort_values(["customer_id", "order_datetime"]).reset_index(drop=True)
    data["customer_prior_order_count"] = data.groupby("customer_id").cumcount()
    data["customer_prior_avg_total"] = (
        data.groupby("customer_id")["order_total"].transform(lambda s: s.shift(1).expanding().mean())
    )
    data["customer_prior_total_std"] = (
        data.groupby("customer_id")["order_total"].transform(lambda s: s.shift(1).expanding().std())
    )

    data["pay_dev_ctry"] = (
        data["payment_method"].fillna("NA").astype(str)
        + "__"
        + data["device_type"].fillna("NA").astype(str)
        + "__"
        + data["ip_country"].fillna("NA").astype(str)
    )
    combo_freq = data["pay_dev_ctry"].value_counts(normalize=True)
    data["pay_dev_ctry_freq"] = data["pay_dev_ctry"].map(combo_freq)
    data["rare_combo_flag"] = (data["pay_dev_ctry_freq"] < 0.01).astype(int)

    for col in [
        "customer_tenure_days",
        "customer_age_years",
        "shipping_delay_days",
        "shipping_to_subtotal_ratio",
        "tax_to_subtotal_ratio",
        "avg_item_value_proxy",
        "customer_prior_avg_total",
        "customer_prior_total_std",
    ]:
        data[col] = data[col].replace([np.inf, -np.inf], np.nan)

    return data


def compute_decision_bands(scores: np.ndarray, threshold: float) -> np.ndarray:
    low_cut = min(0.30, max(0.05, threshold * 0.5))
    review_cut = max(threshold, low_cut + 1e-6)

    bands = np.full(scores.shape, "low", dtype=object)
    bands[scores > low_cut] = "review"
    bands[scores > review_cut] = "block"
    return bands


def score_with_fallback(feature_df: pd.DataFrame) -> np.ndarray:
    base = pd.to_numeric(feature_df.get("risk_score", 0), errors="coerce").fillna(0.0).clip(0.0, 1.0)
    return base.to_numpy(dtype=float)


def train_and_score(model_df: pd.DataFrame) -> Tuple[np.ndarray, str, float | None, float | None]:
    feature_df = model_df.drop(columns=[col for col in DROP_COLS if col in model_df.columns])
    if "is_fraud" not in feature_df.columns:
        return score_with_fallback(feature_df), "fallback_existing_risk_score", None, None

    X = feature_df.drop(columns=["is_fraud"]).copy()
    y = pd.to_numeric(feature_df["is_fraud"], errors="coerce").fillna(0).astype(int)

    if len(X) < 10 or y.nunique() < 2:
        return score_with_fallback(feature_df), "fallback_existing_risk_score", None, None

    split_idx = int(len(model_df) * 0.8)
    split_idx = max(1, min(len(model_df) - 1, split_idx))

    X_train = X.iloc[:split_idx].copy()
    y_train = y.iloc[:split_idx].copy()
    X_test = X.iloc[split_idx:].copy()
    y_test = y.iloc[split_idx:].copy()

    if y_train.nunique() < 2:
        return score_with_fallback(feature_df), "fallback_existing_risk_score", None, None

    numeric_features = X_train.select_dtypes(include=["number", "bool"]).columns.tolist()
    categorical_features = X_train.select_dtypes(exclude=["number", "bool"]).columns.tolist()

    numeric_pipe = Pipeline(
        [
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )
    categorical_pipe = Pipeline(
        [
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="ignore")),
        ]
    )
    preprocessor = ColumnTransformer(
        [
            ("num", numeric_pipe, numeric_features),
            ("cat", categorical_pipe, categorical_features),
        ]
    )

    estimator = Pipeline(
        [
            ("prep", preprocessor),
            (
                "model",
                GradientBoostingClassifier(
                    random_state=42,
                    n_estimators=300,
                    learning_rate=0.03,
                    max_depth=2,
                    min_samples_leaf=10,
                    subsample=0.7,
                ),
            ),
        ]
    )
    estimator.fit(X_train, y_train)

    all_scores = estimator.predict_proba(X)[:, 1]
    holdout_precision = None
    holdout_recall = None

    if len(X_test) > 0:
        holdout_scores = estimator.predict_proba(X_test)[:, 1]
        holdout_labels = (holdout_scores >= FRAUD_THRESHOLD).astype(int)
        holdout_precision = float(precision_score(y_test, holdout_labels, zero_division=0))
        holdout_recall = float(recall_score(y_test, holdout_labels, zero_division=0))

    return all_scores, "gb_tuned_notebook_config", holdout_precision, holdout_recall


def ensure_prediction_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS fraud_predictions (
            order_id INTEGER PRIMARY KEY,
            fraud_probability REAL NOT NULL,
            predicted_fraud INTEGER NOT NULL,
            decision_band TEXT NOT NULL,
            model_threshold REAL NOT NULL,
            model_name TEXT NOT NULL,
            scored_at TEXT NOT NULL,
            FOREIGN KEY(order_id) REFERENCES orders(order_id) ON DELETE CASCADE
        )
        """
    )


def upsert_predictions(
    conn: sqlite3.Connection,
    predictions: pd.DataFrame,
    threshold: float,
    model_name: str,
    scored_at: str,
) -> None:
    ensure_prediction_table(conn)
    rows = [
        (
            int(row.order_id),
            float(row.fraud_probability),
            int(row.predicted_fraud),
            str(row.decision_band),
            float(threshold),
            model_name,
            scored_at,
        )
        for row in predictions.itertuples(index=False)
    ]

    conn.executemany(
        """
        INSERT INTO fraud_predictions (
            order_id,
            fraud_probability,
            predicted_fraud,
            decision_band,
            model_threshold,
            model_name,
            scored_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(order_id) DO UPDATE SET
            fraud_probability = excluded.fraud_probability,
            predicted_fraud = excluded.predicted_fraud,
            decision_band = excluded.decision_band,
            model_threshold = excluded.model_threshold,
            model_name = excluded.model_name,
            scored_at = excluded.scored_at
        """,
        rows,
    )


def run(db_path: str) -> dict:
    with sqlite3.connect(db_path) as conn:
        raw = pd.read_sql_query(BASE_SQL, conn)
        if raw.empty:
            return {
                "updatedCount": 0,
                "blockedCount": 0,
                "reviewCount": 0,
                "lowCount": 0,
                "threshold": FRAUD_THRESHOLD,
                "modelName": "no_data",
                "scoredAt": datetime.now(timezone.utc).isoformat(),
                "holdoutPrecision": None,
                "holdoutRecall": None,
            }

        feat_df = build_features(raw)
        model_df = feat_df.sort_values("order_datetime").copy()
        scores, model_name, holdout_precision, holdout_recall = train_and_score(model_df)
        labels = (scores >= FRAUD_THRESHOLD).astype(int)
        decision_bands = compute_decision_bands(scores, FRAUD_THRESHOLD)

        out = pd.DataFrame(
            {
                "order_id": pd.to_numeric(model_df["order_id"], errors="coerce"),
                "fraud_probability": scores,
                "predicted_fraud": labels,
                "decision_band": decision_bands,
            }
        ).dropna(subset=["order_id"])
        out["order_id"] = out["order_id"].astype(int)

        scored_at = datetime.now(timezone.utc).isoformat()
        upsert_predictions(conn, out, FRAUD_THRESHOLD, model_name, scored_at)
        conn.commit()

        blocked_count = int((out["decision_band"] == "block").sum())
        review_count = int((out["decision_band"] == "review").sum())
        low_count = int((out["decision_band"] == "low").sum())

        return {
            "updatedCount": int(len(out)),
            "blockedCount": blocked_count,
            "reviewCount": review_count,
            "lowCount": low_count,
            "threshold": FRAUD_THRESHOLD,
            "modelName": model_name,
            "scoredAt": scored_at,
            "holdoutPrecision": holdout_precision,
            "holdoutRecall": holdout_recall,
        }


def main() -> int:
    parser = argparse.ArgumentParser(description="Run shop fraud scoring pipeline")
    parser.add_argument("--db-path", required=True, help="Absolute path to shop.db")
    args = parser.parse_args()

    try:
        payload = run(args.db_path)
    except Exception as exc:  # pragma: no cover
        print(str(exc), file=sys.stderr)
        return 1

    print(json.dumps(payload))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

