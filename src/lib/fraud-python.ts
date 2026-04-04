import { spawnSync } from "node:child_process";
import path from "node:path";

export type PythonFraudPrediction = {
  order_id: number;
  risk_score: number;
  predicted_fraud: number;
  decision_band: "low" | "review" | "block";
};

export type PythonFraudScoringResult = {
  model_name: string;
  threshold: number;
  predictions: PythonFraudPrediction[];
};

export function scoreOrdersWithPython(payload: {
  orders: unknown[];
  order_items: unknown[];
}): PythonFraudScoringResult {
  const pythonBin = process.env.PYTHON_BIN?.trim() || "python";
  const projectRoot = process.cwd();
  const scriptPath = path.join(projectRoot, "ml", "score_orders.py");
  const artifactPath = path.join(projectRoot, "artifacts", "shop_fraud_model_bundle.joblib");

  const child = spawnSync(
    pythonBin,
    [scriptPath],
    {
      encoding: "utf8",
      input: JSON.stringify({
        artifact_path: artifactPath,
        orders: payload.orders,
        order_items: payload.order_items,
      }),
      maxBuffer: 25 * 1024 * 1024,
    },
  );

  if (child.error) {
    throw new Error(`Failed to start Python fraud scorer: ${child.error.message}`);
  }

  if (child.status !== 0) {
    const stderr = child.stderr?.trim() || child.stdout?.trim() || "Unknown Python scoring failure.";
    throw new Error(`Python fraud scorer failed: ${stderr}`);
  }

  const stdout = child.stdout?.trim();
  if (!stdout) {
    throw new Error("Python fraud scorer returned no output.");
  }

  return JSON.parse(stdout) as PythonFraudScoringResult;
}
