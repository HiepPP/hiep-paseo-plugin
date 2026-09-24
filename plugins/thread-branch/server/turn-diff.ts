import { execFile } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  TURN_DIFF_MAX_COMMITS,
  TURN_DIFF_MAX_FILES,
  imageType,
  type FileDiffRequest,
  type TurnDiff,
} from "../shared/turn-diff";
import { run, type Exec } from "./git";

export type Git = (
  args: readonly string[],
  cwd: string,
  env?: Readonly<Record<string, string>>,
) => Promise<Exec>;

const defaultGit: Git = (args, cwd, env) => run("git", args, cwd, undefined, undefined, env);

interface Counts {
  added: number | null;
  deleted: number | null;
}

interface Snapshot {
  root: string;
  head: string;
  numstat: Map<string, Counts>;
  untracked: Set<string>;
  tree: string | null;
}

const BINARY: Counts = { added: null, deleted: null };
// Larger new files are listed without line counts instead of being read into memory.
const MAX_READ = 1024 * 1024;
const MAX_UNTRACKED_READS = 200;

/** Parses `git diff --numstat -z --no-renames`: `<added>\t<deleted>\t<path>\0`, `-` for binary. */
export function parseNumstat(output: string): Map<string, Counts> {
  const files = new Map<string, Counts>();
  for (const record of output.split("\0")) {
    const match = record.match(/^(-|\d+)\t(-|\d+)\t([\s\S]+)$/);
    if (!match) continue;
    files.set(match[3], {
      added: match[1] === "-" ? null : Number(match[1]),
      deleted: match[2] === "-" ? null : Number(match[2]),
    });
  }
  return files;
}

/**
 * Takes a snapshot of the work tree. `base` defaults to HEAD; the end snapshot diffs against the
 * start commit, so commits made during the turn count with the uncommitted changes, once.
 */
export async function takeSnapshot(git: Git, cwd: string, base?: string): Promise<Snapshot | null> {
  const top = await git(["rev-parse", "--show-toplevel", "HEAD"], cwd);
  if (top.code !== 0) return null;
  const [root, head] = top.stdout.trim().split("\n");
  if (!root || !head) return null;
  const [diff, others] = await Promise.all([
    git(["diff", "--numstat", "-z", "--no-renames", base ?? head, "--"], root),
    git(["ls-files", "-z", "--others", "--exclude-standard"], root),
  ]);
  if (diff.code !== 0 || others.code !== 0) return null;
  return {
    root,
    head,
    numstat: parseNumstat(diff.stdout),
    untracked: new Set(others.stdout.split("\0").filter(Boolean)),
    tree: await snapshotTree(git, root).catch(() => null),
  };
}

/**
 * Writes the whole work tree, untracked files included, as a git tree object. A copy of the
 * index keeps the user's staging area untouched, and its stat cache avoids rehashing
 * unchanged files. The objects stay loose until `git gc` prunes them.
 */
export async function snapshotTree(git: Git, root: string): Promise<string | null> {
  const indexPath = await git(["rev-parse", "--git-path", "index"], root);
  if (indexPath.code !== 0) return null;
  const dir = await mkdtemp(path.join(tmpdir(), "thread-branch-index-"));
  const index = path.join(dir, "index");
  try {
    // A repo without an index yet starts from an empty one.
    await copyFile(path.resolve(root, indexPath.stdout.trim()), index).catch(() => undefined);
    const env = { GIT_INDEX_FILE: index };
    const added = await git(["add", "-A", "--", "."], root, env);
    if (added.code !== 0) return null;
    const tree = await git(["write-tree"], root, env);
    return tree.code === 0 ? tree.stdout.trim() || null : null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const MAX_FILE_DIFF = 200_000;

/** The diff of one file between the start and end work-tree snapshots of a turn. */
export async function readFileDiff(git: Git, request: FileDiffRequest) {
  const result = await git(
    [
      "diff",
      "--no-color",
      "--no-ext-diff",
      "--no-renames",
      request.from,
      request.to,
      "--",
      request.path,
    ],
    request.root,
  );
  if (result.code !== 0) throw new Error("Could not read the diff for this file.");
  const truncated = result.stdout.length > MAX_FILE_DIFF;
  return { diff: truncated ? result.stdout.slice(0, MAX_FILE_DIFF) : result.stdout, truncated };
}

async function countNewFile(file: string): Promise<Counts> {
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size > MAX_READ) return BINARY;
    const data = await readFile(file);
    // Git's own heuristic: a NUL byte in the first 8000 bytes means binary.
    if (data.subarray(0, 8000).includes(0)) return BINARY;
    let lines = 0;
    for (const byte of data) if (byte === 10) lines++;
    if (data.length > 0 && data[data.length - 1] !== 10) lines++;
    return { added: lines, deleted: 0 };
  } catch {
    return BINARY;
  }
}

function change(start: Counts | undefined, end: Counts | undefined): Counts | null {
  if (start && end && start.added === end.added && start.deleted === end.deleted) return null;
  if (start?.added === null || end?.added === null) return BINARY;
  const from = { added: start?.added ?? 0, deleted: start?.deleted ?? 0 };
  const to = { added: end?.added ?? 0, deleted: end?.deleted ?? 0 };
  // Both sides are relative to the start commit; a shrinking count means lines were undone.
  return {
    added: Math.max(to.added - from.added, 0) + Math.max(from.deleted - to.deleted, 0),
    deleted: Math.max(to.deleted - from.deleted, 0) + Math.max(from.added - to.added, 0),
  };
}

export async function diffSnapshots(start: Snapshot, end: Snapshot) {
  const files: { path: string; added: number | null; deleted: number | null }[] = [];
  for (const file of new Set([...start.numstat.keys(), ...end.numstat.keys()])) {
    const counts = change(start.numstat.get(file), end.numstat.get(file));
    if (counts) files.push({ path: file, ...counts });
  }
  let reads = 0;
  for (const file of end.untracked) {
    if (start.untracked.has(file) || end.numstat.has(file)) continue;
    const counts =
      reads++ < MAX_UNTRACKED_READS ? await countNewFile(path.join(end.root, file)) : BINARY;
    files.push({ path: file, ...counts });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

async function listCommits(git: Git, root: string, from: string, to: string) {
  const log = await git(
    ["log", `--max-count=${TURN_DIFF_MAX_COMMITS}`, "--format=%h%x09%s", `${from}..${to}`, "--"],
    root,
  );
  if (log.code !== 0) return [];
  return log.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const tab = line.indexOf("\t");
      return { sha: line.slice(0, tab), subject: line.slice(tab + 1) };
    });
}

interface Turn {
  cwd: string;
  turnId: string | null;
  start: Promise<Snapshot | null>;
  shared: boolean;
}

// Each side is sent to the app as base64 over the RPC socket, so keep it small.
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

function readBlob(root: string, spec: string): Promise<Buffer | "missing" | "too-large"> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["cat-file", "blob", spec],
      { cwd: root, encoding: "buffer", maxBuffer: MAX_IMAGE_BYTES, timeout: 8_000 },
      (error, stdout) => {
        if (!error) resolve(stdout);
        else
          resolve(
            (error as NodeJS.ErrnoException).code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"
              ? "too-large"
              : "missing",
          );
      },
    );
  });
}

/** The file before and after a turn as `data:` URIs, read from the snapshot trees. */
export async function readFileImage(request: FileDiffRequest) {
  const type = imageType(request.path);
  if (!type) throw new Error("This file is not a previewable image.");
  const [before, after] = await Promise.all(
    [request.from, request.to].map((tree) => readBlob(request.root, `${tree}:${request.path}`)),
  );
  const uri = (blob: Buffer | string) =>
    typeof blob === "string" ? null : `data:${type};base64,${blob.toString("base64")}`;
  return {
    before: uri(before),
    after: uri(after),
    tooLarge: before === "too-large" || after === "too-large",
  };
}

export interface TurnAgent {
  id: string;
  cwd: string;
  workspaceId?: string | null;
}

export function createTurnDiffTracker(git: Git = defaultGit) {
  const turns = new Map<string, Turn>();
  const runningByCwd = new Map<string, Set<string>>();

  function release(agentId: string) {
    const turn = turns.get(agentId);
    if (!turn) return undefined;
    turns.delete(agentId);
    const running = runningByCwd.get(turn.cwd);
    running?.delete(agentId);
    if (running?.size === 0) runningByCwd.delete(turn.cwd);
    return turn;
  }

  return {
    /** Resolves once the start snapshot is taken; callers need not wait. */
    async started(agent: TurnAgent, turnId: string | null): Promise<void> {
      release(agent.id);
      if (!agent.cwd) return;
      const running = runningByCwd.get(agent.cwd) ?? new Set<string>();
      for (const other of running) {
        const turn = turns.get(other);
        if (turn) turn.shared = true;
      }
      const start = takeSnapshot(git, agent.cwd).catch(() => null);
      turns.set(agent.id, { cwd: agent.cwd, turnId, start, shared: running.size > 0 });
      running.add(agent.id);
      runningByCwd.set(agent.cwd, running);
      await start;
    },

    /** The row to append, or null when the turn changed no file and made no commit. */
    async ended(
      agent: TurnAgent,
      turnId: string | null,
    ): Promise<{ rowId: string; diff: TurnDiff } | null> {
      const turn = release(agent.id);
      if (!turn || (turn.turnId && turnId && turn.turnId !== turnId)) return null;
      const start = await turn.start;
      if (!start) return null;
      const end = await takeSnapshot(git, turn.cwd, start.head);
      if (!end || end.root !== start.root) return null;
      const files = await diffSnapshots(start, end);
      const commits =
        end.head === start.head ? [] : await listCommits(git, end.root, start.head, end.head);
      if (files.length === 0 && commits.length === 0) return null;
      const diff: TurnDiff = {
        fileCount: files.length,
        added: files.reduce((sum, file) => sum + (file.added ?? 0), 0),
        deleted: files.reduce((sum, file) => sum + (file.deleted ?? 0), 0),
        files: files.slice(0, TURN_DIFF_MAX_FILES),
        commits,
        shared: turn.shared,
        ...(agent.workspaceId && start.tree && end.tree
          ? {
              source: {
                workspaceId: agent.workspaceId,
                root: end.root,
                from: start.tree,
                to: end.tree,
              },
            }
          : {}),
      };
      return { rowId: `turn-diff:${turnId ?? turn.turnId ?? Date.now()}`, diff };
    },
  };
}
