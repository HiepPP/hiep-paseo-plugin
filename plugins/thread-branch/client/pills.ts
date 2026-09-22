import type { PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { copyText } from "@getpaseo/plugin/client/react-native";
import { getBranchRpc, type BranchInfo } from "../shared/branch";
import { describeBranchPill, describePrPill } from "./buttons";
import { openUrl } from "./open";

export const POLL_MS = 15_000;

interface Tracked {
  workspaceId: string;
  cwd: string;
}

type Client = Pick<PluginClientContext, "rpc" | "addComposerPill"> & {
  paseo: Pick<PluginClientContext["paseo"], "agents">;
};

export interface PillDeps {
  open?: (url: string) => Promise<void>;
  copy?: (text: string) => Promise<void>;
  intervalMs?: number;
}

function signature(info: BranchInfo) {
  return JSON.stringify([
    info.repo,
    info.branch,
    info.detached,
    info.sha,
    info.dirty,
    info.upstream,
    info.ahead,
    info.behind,
    info.pr,
  ]);
}

export function installBranchPills(client: Client, deps: PillDeps = {}) {
  const open = deps.open ?? openUrl;
  const copy = deps.copy ?? copyText;
  const intervalMs = deps.intervalMs ?? POLL_MS;
  const agents = new Map<string, Tracked>();
  const pills = new Map<
    string,
    { branch: PluginButtonRegistration; pr: PluginButtonRegistration; signature: string }
  >();
  const infoByCwd = new Map<string, BranchInfo>();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function actionsFor(cwd: string) {
    return {
      async openPr() {
        const pr = infoByCwd.get(cwd)?.pr;
        if (!pr) throw new Error("No pull request for this branch.");
        await open(pr.url);
      },
      async copy() {
        const branch = infoByCwd.get(cwd)?.branch;
        if (!branch) throw new Error("No branch name to copy.");
        await copy(branch);
      },
      async refresh() {
        await refreshCwd(cwd, true);
      },
    };
  }

  function apply(cwd: string, info: BranchInfo) {
    infoByCwd.set(cwd, info);
    const next = signature(info);
    for (const [agentId, tracked] of agents) {
      if (tracked.cwd !== cwd) continue;
      const actions = actionsFor(cwd);
      const branch = describeBranchPill(info, actions);
      const pr = describePrPill(info, actions.openPr);
      const existing = pills.get(agentId);
      if (existing) {
        // Updating behavior closes an open menu; skip no-op updates from the poll loop.
        if (existing.signature === next) continue;
        existing.branch.update(branch);
        existing.pr.update(pr);
        existing.signature = next;
        continue;
      }
      const target = { workspaceId: tracked.workspaceId, agentId };
      pills.set(agentId, {
        branch: client.addComposerPill({ id: "thread-branch", ...target, button: branch }),
        pr: client.addComposerPill({ id: "thread-branch-pr", ...target, button: pr }),
        signature: next,
      });
    }
  }

  async function refreshCwd(cwd: string, force: boolean) {
    const info = await client.rpc(getBranchRpc, force ? { cwd, force: true } : { cwd });
    if (stopped) return;
    apply(cwd, info);
  }

  async function refreshAll() {
    const cwds = new Set<string>();
    for (const tracked of agents.values()) cwds.add(tracked.cwd);
    await Promise.all(
      [...cwds].map((cwd) =>
        refreshCwd(cwd, false).catch(() => {
          // A failed probe keeps the last known pill state; the next tick retries.
        }),
      ),
    );
  }

  function schedule() {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      void refreshAll().finally(schedule);
    }, intervalMs);
  }

  function track(agent: { id: string; cwd: string; workspaceId?: string | null }) {
    if (!agent.workspaceId || !agent.cwd) return;
    const previous = agents.get(agent.id);
    agents.set(agent.id, { workspaceId: agent.workspaceId, cwd: agent.cwd });
    if (previous && previous.cwd !== agent.cwd) untrack(agent.id, true);
    const known = infoByCwd.get(agent.cwd);
    if (known) apply(agent.cwd, known);
    else if (!previous) void refreshCwd(agent.cwd, false).catch(() => {});
  }

  function untrack(agentId: string, keepAgent = false) {
    const existing = pills.get(agentId);
    existing?.branch.remove();
    existing?.pr.remove();
    pills.delete(agentId);
    if (!keepAgent) agents.delete(agentId);
  }

  const unsubscribe = client.paseo.agents.subscribe((update) => {
    if (stopped) return;
    if (update.kind === "upsert") track(update.agent);
    else if (update.kind === "remove") untrack(update.agentId);
  });

  async function bootstrap() {
    const seen = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await client.paseo.agents.list({
        filter: { includeArchived: false },
        page: { limit: 200, ...(cursor ? { cursor } : {}) },
      });
      if (stopped) return;
      for (const { agent } of page.entries) track(agent);
      if (!page.pageInfo.hasMore) break;
      cursor = page.pageInfo.nextCursor ?? undefined;
      if (!cursor || seen.has(cursor)) break;
      seen.add(cursor);
    } while (cursor);
  }

  void bootstrap()
    .catch(() => {
      // Live upserts still attach pills when the initial listing fails.
    })
    .finally(schedule);

  return () => {
    stopped = true;
    clearTimeout(timer);
    unsubscribe();
    for (const { branch, pr } of pills.values()) {
      branch.remove();
      pr.remove();
    }
    pills.clear();
    agents.clear();
    infoByCwd.clear();
  };
}
