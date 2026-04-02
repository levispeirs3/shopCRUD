"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runScoring, resetScores, type ScoringResult } from "./actions";

export default function RunScoringPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ScoringResult | null>(null);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  function handleRun() {
    setResult(null);
    setResetMsg(null);
    startTransition(async () => {
      const r = await runScoring();
      setResult(r);
    });
  }

  function handleReset() {
    setResult(null);
    setResetMsg(null);
    startTransition(async () => {
      const r = await resetScores();
      setResetMsg(`Reset ${r.reset} order(s) back to risk_score = 0.`);
    });
  }

  function handleViewQueue() {
    router.push("/warehouse/priority");
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Run Fraud Scoring</h1>
        <p className="mt-1 text-sm text-gray-600">
          Run the ML inference job to score all unscored orders for fraud risk.
          Orders with a risk score &ge; 0.5 are flagged as potential fraud.
          After scoring, view the updated priority queue to see which orders need verification.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleRun}
          disabled={isPending}
          className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
        >
          {isPending ? "Scoring\u2026" : "Run Scoring"}
        </button>

        <button
          onClick={handleReset}
          disabled={isPending}
          className="rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
        >
          {isPending ? "Working\u2026" : "Reset All Scores"}
        </button>

        <button
          onClick={handleViewQueue}
          className="rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          View Priority Queue &rarr;
        </button>
      </div>

      {result && (
        <div className={`rounded-lg border p-4 ${result.error ? "border-red-300 bg-red-50" : "border-green-300 bg-green-50"}`}>
          {result.error ? (
            <div>
              <h2 className="font-semibold text-red-800">Scoring Error</h2>
              <p className="mt-1 text-sm text-red-700">{result.error}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <h2 className="font-semibold text-green-800">Scoring Complete</h2>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-gray-600">Orders Scored</dt>
                  <dd className="text-lg font-semibold">{result.ordersScored.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-gray-600">Flagged High-Risk</dt>
                  <dd className="text-lg font-semibold text-red-700">{result.highRiskCount.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-gray-600">Duration</dt>
                  <dd className="text-lg font-semibold">{result.durationMs} ms</dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      )}

      {resetMsg && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4">
          <p className="text-sm text-yellow-800">{resetMsg}</p>
        </div>
      )}

      <div className="rounded border bg-white p-4">
        <h2 className="text-lg font-semibold">How It Works</h2>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-gray-700">
          <li>Scores all orders with <code className="rounded bg-gray-100 px-1">risk_score = 0</code></li>
          <li>Uses a logistic-regression-style model with features: promo usage, order total, device type, IP country, and item count</li>
          <li>Orders scoring &ge; 0.5 are flagged as <code className="rounded bg-gray-100 px-1">is_fraud = 1</code></li>
          <li>Flagged orders appear in the <strong>Warehouse Priority Queue</strong> for manual review</li>
        </ul>
      </div>
    </section>
  );
}
