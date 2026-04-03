import { getFraudPredictionSummary, getFraudPredictions } from "@/lib/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const summary = getFraudPredictionSummary();
  const rows = getFraudPredictions();
  return Response.json({ summary, rows });
}

