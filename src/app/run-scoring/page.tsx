import RunScoringPanel from "@/components/run-scoring-panel";

export const dynamic = "force-dynamic";

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
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Run Fraud Scoring</h1>
      <RunScoringPanel />
    </section>
  );
}
