import { spawn } from "node:child_process";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { Decision, Judge } from "./types";
import type { TokenUsage } from "./usage";

type UsageError = Error & { usage?: TokenUsage };

export function createJudge(configFile: string, root: string, spacingMs = 26000): Judge {
  let queue = Promise.resolve(),
    next = 0;
  return async (phase, state, profiles, signal) => {
    const previous = queue;
    let release!: () => void;
    queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      await previous;
      if (signal.aborted) throw new Error("Evaluation cancelled.");
      await delay(Math.max(0, next - Date.now()), undefined, { signal });
      next = Date.now() + spacingMs;
      return await new Promise<Decision>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [
            "--import",
            path.join(root, "node_modules/tsx/dist/loader.mjs"),
            path.join(root, "server/jev-worker.ts"),
          ],
          { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } },
        );
        let output = "",
          settled = false;
        const kill = () => child.kill("SIGKILL");
        const timer = setTimeout(kill, 23000);
        signal.addEventListener("abort", kill, { once: true });
        child.stdout.on("data", (data) => {
          output += data.toString();
          if (output.length > 64000) kill();
        });
        child.stderr.resume();
        const finish = (code: number | null) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal.removeEventListener("abort", kill);
          try {
            const value = JSON.parse(output);
            if (code !== 0 || value.error) {
              const error: UsageError = new Error(
                typeof value.error === "string" ? value.error : "Jev worker failed.",
              );
              error.usage = value.usage;
              throw error;
            }
            if (!profiles.some((p) => p.id === value.profileId))
              throw Object.assign(new Error("Invalid Jev profile."), { usage: value.usage });
            resolve(value);
          } catch (error) {
            reject(error instanceof Error ? error : new Error("Jev worker unavailable."));
          }
        };
        child.on("error", () => finish(null));
        child.on("close", finish);
        child.stdin.on("error", () => {});
        child.stdin.end(JSON.stringify({ phase, state, profiles, configFile }));
      });
    } finally {
      release();
    }
  };
}
