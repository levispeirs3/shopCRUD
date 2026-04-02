"use server";

import { sql } from "@/lib/shop";

export type ScoringResult = {
  ordersScored: number;
  highRiskCount: number;
  durationMs: number;
  error?: string;
};

/**
 * A lightweight fraud risk model that runs entirely in SQL.
 *
 * It computes a risk_score for every unscored order (risk_score = 0) using a
 * simple weighted-feature formula. The features mirror what a trained
 * logistic-regression model would use:
 *
 *   risk_score = sigmoid(
 *     -1.5
 *     + 0.8  * uses_promo
 *     + 0.6  * high_total          (order_total > 500)
 *     + 0.4  * device_is_mobile
 *     + 0.5  * foreign_ip          (ip_country != 'US')
 *     + 0.3  * many_items          (item count > 5)
 *   )
 *
 * Orders with risk_score >= 0.5 are flagged is_fraud = 1.
 */
export async function runScoring(): Promise<ScoringResult> {
  const start = Date.now();

  try {
    const scored = await sql<Array<{ cnt: number }>>`
      WITH features AS (
        SELECT
          o.order_id,
          (CASE WHEN o.promo_used = 1 THEN 1 ELSE 0 END) AS uses_promo,
          (CASE WHEN o.order_total > 500 THEN 1 ELSE 0 END) AS high_total,
          (CASE WHEN o.device_type = 'mobile' THEN 1 ELSE 0 END) AS device_mobile,
          (CASE WHEN o.ip_country <> 'US' THEN 1 ELSE 0 END) AS foreign_ip,
          COALESCE(ic.item_count, 0) AS item_count
        FROM orders o
        LEFT JOIN (
          SELECT order_id, COUNT(*)::int AS item_count
          FROM order_items
          GROUP BY order_id
        ) ic ON ic.order_id = o.order_id
        WHERE o.risk_score = 0
      ),
      scored AS (
        SELECT
          order_id,
          1.0 / (1.0 + EXP(-(
            -1.5
            + 0.8 * uses_promo
            + 0.6 * high_total
            + 0.4 * device_mobile
            + 0.5 * foreign_ip
            + 0.3 * (CASE WHEN item_count > 5 THEN 1 ELSE 0 END)
          ))) AS score
        FROM features
      ),
      updated AS (
        UPDATE orders o
        SET
          risk_score = s.score,
          is_fraud = CASE WHEN s.score >= 0.5 THEN 1 ELSE 0 END
        FROM scored s
        WHERE o.order_id = s.order_id
        RETURNING o.order_id, o.is_fraud
      )
      SELECT COUNT(*)::int AS cnt FROM updated
    `;

    const ordersScored = scored[0]?.cnt ?? 0;

    const highRisk = await sql<Array<{ cnt: number }>>`
      SELECT COUNT(*)::int AS cnt
      FROM orders
      WHERE is_fraud = 1
    `;

    return {
      ordersScored,
      highRiskCount: highRisk[0]?.cnt ?? 0,
      durationMs: Date.now() - start,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ordersScored: 0,
      highRiskCount: 0,
      durationMs: Date.now() - start,
      error: msg,
    };
  }
}

export async function resetScores(): Promise<{ reset: number }> {
  const result = await sql<Array<{ cnt: number }>>`
    WITH updated AS (
      UPDATE orders
      SET risk_score = 0, is_fraud = 0
      WHERE risk_score <> 0 OR is_fraud <> 0
      RETURNING order_id
    )
    SELECT COUNT(*)::int AS cnt FROM updated
  `;
  return { reset: result[0]?.cnt ?? 0 };
}
