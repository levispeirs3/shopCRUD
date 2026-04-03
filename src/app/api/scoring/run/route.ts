import { resolveDbPath } from "@/lib/db";
import { runFraudScoringPipeline } from "@/lib/fraud-pipeline";
import { getFraudPredictionSummary, getFraudPredictions } from "@/lib/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const pipelineResult = runFraudScoringPipeline(resolveDbPath());
    const summary = getFraudPredictionSummary();
    const rows = getFraudPredictions();

    return Response.json({
      pipelineResult,
      summary,
      rows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run scoring pipeline.";
    return Response.json({ error: message }, { status: 500 });
  }
}

