"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type PredictionRow = {
  order_id: number;
  customer_id: number;
  customer_name: string;
  order_timestamp: string;
  total_value: number;
  fraud_probability: number;
  predicted_fraud: number;
  decision_band: "low" | "review" | "block";
  scored_at: string;
  actual_fraud: number;
};

type PredictionSummary = {
  scored_count: number;
  block_count: number;
  review_count: number;
  low_count: number;
  threshold: number;
} | null;

type PredictionResponse = {
  summary: PredictionSummary;
  rows: PredictionRow[];
  error?: string;
};

function formatIso(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return value;
  }
  return parsed.toLocaleString();
}

function getBandStyles(band: PredictionRow["decision_band"]) {
  if (band === "block") {
    return "bg-red-100 text-red-800";
  }
  if (band === "review") {
    return "bg-amber-100 text-amber-800";
  }
  return "bg-emerald-100 text-emerald-800";
}

export default function RunScoringPanel() {
  const [rows, setRows] = useState<PredictionRow[]>([]);
  const [summary, setSummary] = useState<PredictionSummary>(null);
  const [loading, setLoading] = useState(true);
  const [updatingOrderIds, setUpdatingOrderIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const loadPredictions = useCallback(async () => {
    const response = await fetch("/api/scoring/predictions", {
      cache: "no-store",
    });
    const data = (await response.json()) as PredictionResponse;
    if (!response.ok) {
      throw new Error(data.error || "Unable to load predictions.");
    }
    setSummary(data.summary);
    setRows(data.rows);
  }, []);

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        await loadPredictions();
      } catch (err) {
        if (active) {
          const message = err instanceof Error ? err.message : "Unable to load predictions.";
          setError(message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    run();
    return () => {
      active = false;
    };
  }, [loadPredictions]);

  const hasPredictions = rows.length > 0;
  const thresholdLabel = useMemo(() => {
    if (!summary) {
      return "N/A";
    }
    return summary.threshold.toFixed(3);
  }, [summary]);

  async function updateActualFraud(orderId: number, nextValue: boolean) {
    setUpdatingOrderIds((prev) => new Set(prev).add(orderId));
    setError(null);

    try {
      const response = await fetch(`/api/scoring/predictions/${orderId}/actual-fraud`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isFraud: nextValue }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Failed to update fraud label.");
      }

      setRows((prev) =>
        prev.map((row) => (row.order_id === orderId ? { ...row, actual_fraud: nextValue ? 1 : 0 } : row)),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update fraud label.";
      setError(message);
    } finally {
      setUpdatingOrderIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded border bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-gray-700">
            Threshold: <span className="font-semibold">{thresholdLabel}</span>
          </span>
        </div>
        <p className="mt-3 text-sm text-gray-700">
          Review the current fraud probability predictions for transactions. Use the switch in the table to
          mark whether each transaction was actually fraud.
        </p>
        {error ? <p className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}
      </div>

      {summary ? (
        <div className="grid gap-2 text-sm sm:grid-cols-4">
          <div className="rounded border bg-white p-3">
            <p className="text-gray-600">Scored</p>
            <p className="text-lg font-semibold">{summary.scored_count}</p>
          </div>
          <div className="rounded border bg-white p-3">
            <p className="text-gray-600">Block</p>
            <p className="text-lg font-semibold">{summary.block_count}</p>
          </div>
          <div className="rounded border bg-white p-3">
            <p className="text-gray-600">Review</p>
            <p className="text-lg font-semibold">{summary.review_count}</p>
          </div>
          <div className="rounded border bg-white p-3">
            <p className="text-gray-600">Low</p>
            <p className="text-lg font-semibold">{summary.low_count}</p>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded border bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left">
              <th className="p-2">Order</th>
              <th className="p-2">Customer</th>
              <th className="p-2">Timestamp</th>
              <th className="p-2">Total</th>
              <th className="p-2">Fraud Prob.</th>
              <th className="p-2">Decision</th>
              <th className="p-2">Scored At</th>
              <th className="p-2">Actually Fraud?</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isUpdating = updatingOrderIds.has(row.order_id);
              return (
                <tr key={row.order_id} className="border-b">
                  <td className="p-2 font-medium">#{row.order_id}</td>
                  <td className="p-2">
                    {row.customer_name} (#{row.customer_id})
                  </td>
                  <td className="p-2">{row.order_timestamp}</td>
                  <td className="p-2">${Number(row.total_value).toFixed(2)}</td>
                  <td className="p-2">{Number(row.fraud_probability).toFixed(3)}</td>
                  <td className="p-2">
                    <span className={`inline-flex rounded px-2 py-1 text-xs font-medium ${getBandStyles(row.decision_band)}`}>
                      {row.decision_band.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-2">{formatIso(row.scored_at)}</td>
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <label
                        className={`relative inline-flex h-6 w-11 items-center ${isUpdating ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                      >
                        <input
                          type="checkbox"
                          className="peer sr-only"
                          checked={Boolean(row.actual_fraud)}
                          disabled={!hasPredictions || isUpdating}
                          onChange={(event) => updateActualFraud(row.order_id, event.currentTarget.checked)}
                        />
                        <span className="h-6 w-11 rounded-full bg-gray-300 transition peer-checked:bg-red-500" />
                        <span className="pointer-events-none absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-5" />
                      </label>
                      <span className="text-xs text-gray-700">{row.actual_fraud ? "Yes" : "No"}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 ? (
              <tr>
                <td className="p-3 text-gray-500" colSpan={8}>
                  No scored transactions are available.
                </td>
              </tr>
            ) : null}
            {loading ? (
              <tr>
                <td className="p-3 text-gray-500" colSpan={8}>
                  Loading predictions...
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
