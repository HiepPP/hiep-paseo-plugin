import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

/** A named index keeps `qmd update` away from the user's default index and its collections. */
export const QMD_INDEX = "paseo-threads";
export const QMD_COLLECTION = "paseo-threads";
const UPDATE_INTERVAL_MS = 30_000;
const TIMEOUT_MS = 120_000;
const MAX_STDOUT = 64_000;
const FALLBACK_BINS = ["/opt/homebrew/bin/qmd", "/usr/local/bin/qmd"];

/** The daemon PATH may miss Homebrew, so known install paths are checked last. */
export function findQmd(
  env: NodeJS.ProcessEnv = process.env,
  exists: (file: string) => boolean = existsSync,
): string | null {
  if (env.QMD_BIN && exists(env.QMD_BIN)) return env.QMD_BIN;
  for (const dir of (env.PATH ?? "").split(path.delimiter)) {
    if (dir && exists(path.join(dir, "qmd"))) return path.join(dir, "qmd");
  }
  return FALLBACK_BINS.find((file) => exists(file)) ?? null;
}

export interface RunResult {
  code: number | null;
  stdout: string;
}
export type Runner = (args: string[], signal: AbortSignal) => Promise<RunResult>;

/** Runs `qmd --index paseo-threads <args>` without a shell, with a timeout. */
export function createRunner(bin: string, env: NodeJS.ProcessEnv = process.env): Runner {
  // The qmd launcher runs `node` from PATH, and its native modules match the user's first
  // `node`. Keep the user's order; qmd's own folder is only a fallback.
  const PATH = [env.PATH, path.dirname(bin)].filter(Boolean).join(path.delimiter);
  return (args, signal) =>
    new Promise((resolve, reject) => {
      const child = spawn(bin, ["--index", QMD_INDEX, ...args], {
        stdio: ["ignore", "pipe", "ignore"],
        env: { ...env, PATH },
      });
      let stdout = "";
      const kill = () => child.kill("SIGKILL");
      const timer = setTimeout(kill, TIMEOUT_MS);
      signal.addEventListener("abort", kill, { once: true });
      const done = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", kill);
      };
      child.stdout.on("data", (data) => {
        if (stdout.length < MAX_STDOUT) stdout += data;
      });
      child.on("error", (error) => {
        done();
        reject(error);
      });
      child.on("close", (code) => {
        done();
        resolve({ code, stdout });
      });
    });
}

export interface IndexerOptions {
  dir: string;
  run: Runner;
  log: (line: string) => void;
  intervalMs?: number;
}

/**
 * Adds the export folder as a collection once, then runs `update` at most once per interval.
 * Updates never overlap; a notify during a run schedules one more run.
 * qmd output is not logged because it can quote thread text.
 */
export function createIndexer(options: IndexerOptions) {
  const intervalMs = options.intervalMs ?? UPDATE_INTERVAL_MS;
  const controller = new AbortController();
  let ready: Promise<boolean> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let dirty = false;
  let lastRun = -Infinity;

  async function ensureCollection(): Promise<boolean> {
    try {
      await mkdir(options.dir, { recursive: true, mode: 0o700 });
      const list = await options.run(["collection", "list"], controller.signal);
      if (list.code !== 0) {
        options.log(`qmd collection list failed with exit ${list.code}`);
        return false;
      }
      if (list.stdout.includes(`qmd://${QMD_COLLECTION}/`)) return true;
      const added = await options.run(
        ["collection", "add", options.dir, "--name", QMD_COLLECTION, "--mask", "**/*.md"],
        controller.signal,
      );
      options.log(`qmd collection add exit ${added.code}`);
      return added.code === 0;
    } catch (error) {
      options.log(`qmd setup failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  async function update() {
    timer = undefined;
    if (controller.signal.aborted || !(await (ready ?? start()))) return;
    running = true;
    lastRun = Date.now();
    try {
      const result = await options.run(["update"], controller.signal);
      options.log(`qmd update exit ${result.code} in ${Date.now() - lastRun} ms`);
    } catch (error) {
      options.log(`qmd update failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      running = false;
    }
    if (dirty) {
      dirty = false;
      notify();
    }
  }

  function start(): Promise<boolean> {
    ready ??= ensureCollection();
    return ready;
  }

  function notify() {
    if (controller.signal.aborted) return;
    if (running) {
      dirty = true;
      return;
    }
    if (timer) return;
    timer = setTimeout(() => void update(), Math.max(0, lastRun + intervalMs - Date.now()));
  }

  return {
    start,
    notify,
    stop() {
      controller.abort();
      clearTimeout(timer);
      timer = undefined;
    },
  };
}
