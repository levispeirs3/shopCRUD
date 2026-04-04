from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd


def first_object(value: Any) -> dict[str, Any]:
    if isinstance(value, list):
        return value[0] if value else {}
    if isinstance(value, dict):
        return value
    return {}


def normalize_orders(order_rows: list[dict[str, Any]]) -> pd.DataFrame:
    normalized: list[dict[str, Any]] = []
    for row in order_rows:
        customer = first_object(row.get("customers"))
        shipment = first_object(row.get("shipments"))
        normalized.append(
            {
                "order_id": row.get("order_id"),
                "customer_id": row.get("customer_id"),
                "order_datetime": row.get("order_datetime"),
                "billing_zip": row.get("billing_zip"),
                "shipping_zip": row.get("shipping_zip"),
                "shipping_state": row.get("shipping_state"),
                "payment_method": row.get("payment_method"),
                "device_type": row.get("device_type"),
                "ip_country": row.get("ip_country"),
                "promo_used": row.get("promo_used"),
                "order_subtotal": row.get("order_subtotal"),
                "shipping_fee": row.get("shipping_fee"),
                "tax_amount": row.get("tax_amount"),
                "order_total": row.get("order_total"),
                "risk_score": row.get("risk_score"),
                "gender": customer.get("gender"),
                "birthdate": customer.get("birthdate"),
                "customer_created_at": customer.get("created_at"),
                "city": customer.get("city"),
                "customer_state": customer.get("state"),
                "customer_segment": customer.get("customer_segment"),
                "loyalty_tier": customer.get("loyalty_tier"),
                "is_active": customer.get("is_active"),
                "carrier": shipment.get("carrier"),
                "shipping_method": shipment.get("shipping_method"),
                "distance_band": shipment.get("distance_band"),
                "promised_days": shipment.get("promised_days"),
                "actual_days": shipment.get("actual_days"),
                "late_delivery": shipment.get("late_delivery"),
            }
        )
    return pd.DataFrame(normalized)


def aggregate_items(item_rows: list[dict[str, Any]]) -> pd.DataFrame:
    if not item_rows:
        return pd.DataFrame(
            columns=[
                "order_id",
                "line_count",
                "total_quantity",
                "item_line_total",
                "avg_unit_price",
                "max_unit_price",
                "distinct_products",
            ]
        )

    items = pd.DataFrame(item_rows).copy()
    items["quantity"] = pd.to_numeric(items["quantity"], errors="coerce")
    items["line_total"] = pd.to_numeric(items["line_total"], errors="coerce")
    items["unit_price"] = pd.to_numeric(items["unit_price"], errors="coerce")

    return (
        items.groupby("order_id", dropna=False)
        .agg(
            line_count=("order_id", "size"),
            total_quantity=("quantity", "sum"),
            item_line_total=("line_total", "sum"),
            avg_unit_price=("unit_price", "mean"),
            max_unit_price=("unit_price", "max"),
            distinct_products=("product_id", "nunique"),
        )
        .reset_index()
    )


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
        data["billing_zip"].fillna("").astype(str).str[:5]
        != data["shipping_zip"].fillna("").astype(str).str[:5]
    ).astype(int)
    data["state_mismatch"] = (
        data["shipping_state"].fillna("").astype(str)
        != data["customer_state"].fillna("").astype(str)
    ).astype(int)

    data["shipping_to_subtotal_ratio"] = data["shipping_fee"] / data["order_subtotal"].replace(0, np.nan)
    data["tax_to_subtotal_ratio"] = data["tax_amount"] / data["order_subtotal"].replace(0, np.nan)
    data["avg_item_value_proxy"] = data["order_subtotal"] / data["total_quantity"].replace(0, np.nan)

    high_ticket_cutoff = pd.to_numeric(data["order_total"], errors="coerce").quantile(0.90)
    data["high_ticket_order"] = (
        pd.to_numeric(data["order_total"], errors="coerce") > high_ticket_cutoff
    ).astype(int)

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


def compute_decision_bands(scores: np.ndarray, threshold: float) -> list[str]:
    low_cut = min(0.30, max(0.05, threshold * 0.5))
    review_cut = max(threshold, low_cut + 1e-6)
    bands = np.full(scores.shape, "low", dtype=object)
    bands[scores > low_cut] = "review"
    bands[scores > review_cut] = "block"
    return [str(value) for value in bands.tolist()]


def score_orders(payload: dict[str, Any]) -> dict[str, Any]:
    artifact_path = Path(payload["artifact_path"])
    if not artifact_path.exists():
        raise FileNotFoundError(f"Model bundle not found: {artifact_path}")

    bundle = joblib.load(artifact_path)
    estimator = bundle["estimator"]
    threshold = float(bundle["threshold"])
    feature_columns = list(bundle["feature_columns"])
    model_name = str(bundle["model_name"])

    orders_df = normalize_orders(payload.get("orders", []))
    items_df = aggregate_items(payload.get("order_items", []))
    merged = orders_df.merge(items_df, on="order_id", how="left")
    feature_df = build_features(merged)

    model_input = feature_df.copy()
    for col in feature_columns:
        if col not in model_input.columns:
            model_input[col] = np.nan
    model_input = model_input[feature_columns]

    scores = estimator.predict_proba(model_input)[:, 1]
    labels = (scores >= threshold).astype(int)
    bands = compute_decision_bands(scores, threshold)

    predictions = []
    for order_id, score, label, band in zip(
        feature_df["order_id"].astype(int).tolist(),
        scores.tolist(),
        labels.tolist(),
        bands,
        strict=True,
    ):
        predictions.append(
            {
                "order_id": int(order_id),
                "risk_score": float(score),
                "predicted_fraud": int(label),
                "decision_band": band,
            }
        )

    return {
        "model_name": model_name,
        "threshold": threshold,
        "predictions": predictions,
    }


def main() -> int:
    try:
        payload = json.load(sys.stdin)
        result = score_orders(payload)
        print(json.dumps(result))
        return 0
    except Exception as exc:  # pragma: no cover
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
