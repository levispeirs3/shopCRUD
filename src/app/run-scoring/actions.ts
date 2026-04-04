"use server";

import {
  getFraudPredictionSummary,
  runFraudScoringJob,
  setOrderActualFraud,
} from "@/lib/shop";

export type ScoringResult = {
  updatedCount: number;
  blockedCount: number;
  reviewCount: number;
  lowCount: number;
  threshold: number;
  modelName: string;
  scoredAt: string;
  holdoutPrecision: number | null;
  holdoutRecall: number | null;
  error?: string;
};

export async function runScoring(): Promise<ScoringResult> {
  try {
    return await runFraudScoringJob();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      updatedCount: 0,
      blockedCount: 0,
      reviewCount: 0,
      lowCount: 0,
      threshold: 0,
      modelName: "supabase-risk-heuristic-v1",
      scoredAt: new Date().toISOString(),
      holdoutPrecision: null,
      holdoutRecall: null,
      error: msg,
    };
  }
}

export async function getScoringSummary() {
  return getFraudPredictionSummary();
}

export async function markActualFraud(orderId: number, isFraud: boolean) {
  return setOrderActualFraud(orderId, isFraud);
}
