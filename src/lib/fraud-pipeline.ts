import { spawnSync } from "node:child_process";

export type FraudPipelineRunResult = {
  updatedCount: number;
  blockedCount: number;
  reviewCount: number;
  lowCount: number;
  threshold: number;
  modelName: string;
  scoredAt: string;
  holdoutPrecision: number | null;
  holdoutRecall: number | null;
};

type PythonCommand = {
  command: string;
  prefixArgs: string[];
};

const PYTHON_CANDIDATES: PythonCommand[] = [
  { command: "py", prefixArgs: ["-3"] },
  { command: "python", prefixArgs: [] },
  { command: "python3", prefixArgs: [] },
];

function parseJsonFromStdout(stdout: string) {
  const lines = stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const payload = lines.at(-1);
  if (!payload) {
    throw new Error("Pipeline script returned no output.");
  }
  return JSON.parse(payload) as FraudPipelineRunResult;
}

export function runFraudScoringPipeline(dbPath: string) {
  const scriptPath = "ml/shop_fraud_pipeline.py";

  const errors: string[] = [];

  for (const candidate of PYTHON_CANDIDATES) {
    const result = spawnSync(
      candidate.command,
      [...candidate.prefixArgs, scriptPath, "--db-path", dbPath],
      {
        encoding: "utf8",
        cwd: process.cwd(),
      },
    );

    if (result.error) {
      errors.push(`${candidate.command}: ${result.error.message}`);
      continue;
    }

    if (result.status !== 0) {
      const stderr = result.stderr?.trim();
      const stdout = result.stdout?.trim();
      errors.push(`${candidate.command}: ${stderr || stdout || "Unknown failure"}`);
      continue;
    }

    try {
      return parseJsonFromStdout(result.stdout ?? "");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid JSON output";
      errors.push(`${candidate.command}: ${message}`);
    }
  }

  throw new Error(`Failed to run Python ML pipeline. ${errors.join(" | ")}`);
}
