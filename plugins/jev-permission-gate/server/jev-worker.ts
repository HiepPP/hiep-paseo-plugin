// Runs in a standalone Node process: the AI SDK fails inside the bundled plugin subprocess.
import { createGateway } from "@ai-sdk/gateway";
import { experimental_evaluate as evaluate } from "ai";
import { readFile } from "node:fs/promises";
import { POLICY, QUESTIONS, type GateState, type Verdict } from "./policy";

async function run(state: GateState, configFile: string): Promise<Verdict> {
  const config = JSON.parse(await readFile(configFile, "utf8"));
  const key = config?.agents?.providers?.["vercel-gateway"]?.env?.OPENAI_API_KEY;
  if (typeof key !== "string" || !key) throw new Error("Jev Gateway credential unavailable.");
  const result = await evaluate({
    model: createGateway({ apiKey: key }).evaluationModel("typesafe-ai/jev"),
    state: {
      policy: POLICY,
      command: state.command,
      tool: state.tool,
      cwd_relative: state.cwdRelative,
    },
    questions: QUESTIONS,
    maxRetries: 0,
  });
  const readOnly = result.answers.readOnly as { probability?: unknown };
  const action = result.answers.action as {
    choice?: unknown;
    probabilities?: Record<string, number>;
  };
  const choice = action.choice;
  if (typeof readOnly.probability !== "number") throw new Error("Invalid readOnly answer.");
  if (choice !== "allow" && choice !== "deny" && choice !== "escalate")
    throw new Error("Invalid action answer.");
  const probability = action.probabilities?.[choice];
  if (typeof probability !== "number") throw new Error("Missing action probability.");
  // Boolean answers carry only P(true); derive the value and the confidence of that value.
  const value = readOnly.probability >= 0.5;
  return {
    readOnly: { value, probability: value ? readOnly.probability : 1 - readOnly.probability },
    action: { choice, probability },
  };
}

let input = "";
for await (const chunk of process.stdin) {
  input += chunk;
  if (Buffer.byteLength(input) > 64000) throw new Error("Input too large");
}
try {
  const { state, configFile } = JSON.parse(input);
  process.stdout.write(JSON.stringify(await run(state, configFile)));
} catch (error) {
  process.stdout.write(
    JSON.stringify({ error: error instanceof Error ? error.message : "Jev unavailable" }),
  );
  process.exitCode = 1;
}
