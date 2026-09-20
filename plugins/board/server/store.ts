import type { PluginHookAgent, PluginTurnOutcome } from "@getpaseo/plugin/server";
import type { BoardRun } from "../shared/board";

type Run = BoardRun & {
  providerTurnId: string | null;
  snapshotTurnId: string | null;
  dismissed?: boolean;
};
export type ActiveAgent = PluginHookAgent & {
  project?: string;
  activeTurn?: { turnId: string; startedAt: string | null } | null;
};

export function createRunStore(now = () => new Date().toISOString()) {
  const observingSince = now();
  const active = new Map<string, Run>();
  const finished: Run[] = [];
  let revision = 0;
  const metadata = (agent: PluginHookAgent) => ({
    agentId: agent.id,
    title: agent.title || "Untitled run",
    project: agent.cwd.split(/[\\/]/).filter(Boolean).pop() || "Unknown project",
    provider: agent.provider,
  });
  function make(agent: PluginHookAgent, turnId: string | null, startedAt: string | null): Run {
    const previous = finished.findIndex((run) => run.agentId === agent.id);
    const title = agent.title || active.get(agent.id)?.title || finished[previous]?.title;
    if (previous !== -1) finished.splice(previous, 1);
    return {
      ...metadata(agent),
      title: title || "Untitled run",
      id: agent.id,
      providerTurnId: turnId,
      snapshotTurnId: null,
      status: "running",
      startedAt,
      endedAt: null,
    };
  }
  function finish(run: Run, status: BoardRun["status"]) {
    run.status = status;
    run.endedAt = now();
    if (active.get(run.agentId) === run) active.delete(run.agentId);
    finished.unshift(run);
    finished.splice(50);
  }
  return {
    get revision() {
      return revision;
    },
    updateTitle(agentId: string, title: string | null) {
      if (!title) return;
      const run = active.get(agentId) ?? finished.find((item) => item.agentId === agentId);
      if (run) run.title = title;
    },
    start(agent: PluginHookAgent, turnId: string | null) {
      revision++;
      const existing = active.get(agent.id);
      if (
        existing &&
        ((existing.providerTurnId ?? existing.snapshotTurnId) === null ||
          (existing.providerTurnId ?? existing.snapshotTurnId) === turnId)
      ) {
        existing.providerTurnId = turnId;
        return;
      }
      active.set(agent.id, make(agent, turnId, now()));
    },
    end(agent: PluginHookAgent, turnId: string | null, outcome: PluginTurnOutcome) {
      revision++;
      let run = active.get(agent.id);
      const knownId = run?.providerTurnId ?? run?.snapshotTurnId;
      if (
        run &&
        turnId !== null &&
        knownId !== null &&
        knownId !== undefined &&
        knownId !== turnId
      ) {
        // A delayed terminal event must not finish a newer provider turn.
        return;
      }
      if (!run) {
        const previous = finished.find((r) => r.agentId === agent.id);
        if (previous) {
          if ((previous.providerTurnId ?? previous.snapshotTurnId) !== turnId) return;
          if (previous.status === "unknown") {
            previous.status = outcome.kind === "canceled" ? "cancelled" : outcome.kind;
            previous.endedAt = now();
            finished.splice(finished.indexOf(previous), 1);
            finished.unshift(previous);
          }
          return;
        }
        run = make(agent, turnId, null);
      }
      run.providerTurnId = turnId;
      run.title = agent.title || run.title;
      finish(run, outcome.kind === "canceled" ? "cancelled" : outcome.kind);
    },
    reconcile(agents: ActiveAgent[], expectedRevision: number) {
      // Discard a list captured across a lifecycle event; the next refresh retries.
      if (revision !== expectedRevision) return;
      const present = new Set(agents.map((a) => a.id));
      for (const run of active.values()) if (!present.has(run.agentId)) finish(run, "unknown");
      for (const agent of agents) {
        let run = active.get(agent.id);
        const snapshotId = agent.activeTurn?.turnId ?? null;
        if (
          !run &&
          snapshotId &&
          finished.some(
            (r) => r.agentId === agent.id && (r.providerTurnId ?? r.snapshotTurnId) === snapshotId,
          )
        )
          continue;
        const knownId = run?.snapshotTurnId ?? run?.providerTurnId;
        if (run && knownId && snapshotId && knownId !== snapshotId) {
          run = undefined;
        }
        if (!run) {
          run = make(agent, null, agent.activeTurn?.startedAt ?? null);
          active.set(agent.id, run);
        }
        run.snapshotTurnId = snapshotId;
        run.startedAt = agent.activeTurn?.startedAt ?? run.startedAt;
        run.title = agent.title || run.title;
        run.project = agent.project || run.project;
      }
    },
    removeFinished(id: string, scope: string, endedAt: string | null) {
      if (scope !== observingSince) return false;
      const run = finished.find((item) => item.id === id);
      if (!run || run.endedAt !== endedAt) return false;
      // Retain bounded metadata so repeated terminal events cannot restore a removed card.
      run.dismissed = true;
      return true;
    },
    snapshot() {
      const runs = [...active.values(), ...finished]
        .filter((run) => !run.dismissed)
        .map(({ providerTurnId: _p, snapshotTurnId: _s, dismissed: _d, ...run }) => run);
      return { runs, observingSince };
    },
    clear() {
      active.clear();
      finished.length = 0;
    },
  };
}
