import RunScoringPanel from "@/components/run-scoring-panel";

export const dynamic = "force-dynamic";

export default function RunScoringPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Run Fraud Scoring</h1>
      <RunScoringPanel />
    </section>
  );
}
