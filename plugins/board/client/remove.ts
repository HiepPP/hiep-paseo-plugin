import type { PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { boardRpc, removeRunRpc } from "../shared/board";

export function installRemoveButtons(client: PluginClientContext) {
  const buttons = new Map<string, PluginButtonRegistration>();
  const workspaces = new Map<string, string>();
  let stopped = false;
  let revision = 0;
  let timer: ReturnType<typeof setTimeout>;
  const clear = () => {
    for (const button of buttons.values()) button.remove();
    buttons.clear();
    workspaces.clear();
  };
  async function refresh() {
    const currentRevision = revision;
    try {
      const snapshot = await client.rpc(boardRpc, {});
      const finished = snapshot.runs.filter((run) => run.status !== "running");
      const entries = await Promise.all(
        finished.map(async (run) => {
          let workspaceId = workspaces.get(run.id);
          if (!workspaceId) {
            const agent = await client.paseo.agents.ref(run.agentId).refresh();
            workspaceId = agent?.agent.workspaceId ?? undefined;
          }
          return { run, workspaceId };
        }),
      );
      if (stopped || currentRevision !== revision) return;
      const ids = new Set(entries.filter((entry) => entry.workspaceId).map(({ run }) => run.id));
      for (const [id, button] of buttons) {
        if (!ids.has(id)) {
          button.remove();
          buttons.delete(id);
          workspaces.delete(id);
        }
      }
      for (const { run, workspaceId } of entries) {
        if (!workspaceId) continue;
        workspaces.set(run.id, workspaceId);
        const button = {
          title: "Remove from Board",
          label: "Remove",
          icon: "X",
          behavior: {
            kind: "action" as const,
            async onPress() {
              const result = await client.rpc(removeRunRpc, {
                id: run.id,
                observingSince: snapshot.observingSince,
                endedAt: run.endedAt,
              });
              if (!result.removed) throw new Error("Run changed. Refresh and retry.");
              revision++;
              buttons.get(run.id)?.remove();
              buttons.delete(run.id);
              workspaces.delete(run.id);
              if (!stopped) client.openSurface("board");
            },
          },
        };
        const existing = buttons.get(run.id);
        if (existing) existing.update(button);
        else {
          buttons.set(
            run.id,
            client.addComposerPill({
              id: `remove-${run.id}`,
              workspaceId,
              agentId: run.agentId,
              button,
            }),
          );
        }
      }
    } catch {
      // Never offer Remove when the host cannot confirm finished Board membership.
      if (!stopped && currentRevision === revision) clear();
    } finally {
      if (!stopped) timer = setTimeout(refresh, 2_000);
    }
  }
  void refresh();
  return () => {
    stopped = true;
    clearTimeout(timer);
    clear();
  };
}
