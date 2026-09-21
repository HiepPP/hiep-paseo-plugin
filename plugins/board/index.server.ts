import type { PluginServerContext } from "@getpaseo/plugin/server";
import { createRunStore } from "./server/store";
import { listRunning } from "./server/snapshot";
import { boardRpc, removeRunRpc, starRunRpc } from "./shared/board";

export default function contribute(server: PluginServerContext) {
  const store = createRunStore();
  const controller = new AbortController();
  const removeStart = server.on("agent.turn_started", ({ agent, turnId }) =>
    store.start(agent, turnId),
  );
  const removeEnd = server.on("agent.turn_ended", ({ agent, turnId, outcome }) =>
    store.end(agent, turnId, outcome),
  );
  let pending: Promise<void> | undefined;
  server.handle(starRunRpc, ({ id, observingSince, starred }) => ({
    updated: store.setStarred(id, observingSince, starred),
  }));
  server.handle(removeRunRpc, ({ id, observingSince, endedAt }) => ({
    removed: store.removeFinished(id, observingSince, endedAt),
  }));
  server.handle(boardRpc, async (_, { paseo }) => {
    if (!pending) {
      const revision = store.revision;
      pending = listRunning(paseo, controller.signal)
        .then(async (agents) => {
          if (!controller.signal.aborted) store.reconcile(agents, revision);
          await Promise.all(
            store
              .snapshot()
              .runs.filter((run) => run.title === "Untitled run")
              .map(async (run) => {
                const current = await paseo.agents.ref(run.agentId).refresh();
                if (!controller.signal.aborted && current) {
                  store.updateTitle(run.agentId, current.agent.title);
                }
              }),
          );
        })
        .finally(() => {
          pending = undefined;
        });
    }
    await pending;
    return store.snapshot();
  });
  return () => {
    controller.abort();
    removeStart();
    removeEnd();
    store.clear();
  };
}
