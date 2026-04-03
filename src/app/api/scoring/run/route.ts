import { getFraudPredictionSummary, getFraudPredictions, runFraudScoringJob } from "@/lib/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const pipelineResult = await runFraudScoringJob();
    const summary = await getFraudPredictionSummary();
    const rows = await getFraudPredictions();

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
