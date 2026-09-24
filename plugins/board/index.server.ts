import type { PluginServerContext } from "@getpaseo/plugin/server";
import { homedir } from "node:os";
import path from "node:path";
import { boardSize } from "./shared/board-size";
import { orbSettings } from "./shared/orb";
import { projectColors } from "./shared/project-colors";
import { createRunStore } from "./server/store";
import { createRunPersistence } from "./server/persistence";
import { listRunning } from "./server/snapshot";
import { boardRpc, removeRunRpc, starRunRpc } from "./shared/board";
import { createRecapStore, parseRecap, recapEntry } from "./server/recaps";
import { recapsRpc } from "./shared/recaps";

export default function contribute(server: PluginServerContext) {
  server.registerSettings(projectColors);
  server.registerSettings(boardSize);
  server.registerSettings(orbSettings);
  const store = createRunStore();
  const controller = new AbortController();
  const ensureActive = () => {
    if (controller.signal.aborted) throw new Error("Board stopped.");
  };
  const home = process.env.PASEO_HOME || path.join(homedir(), ".paseo");
  const persistence = createRunPersistence(path.join(home, "plugin-data/board/runs.json"));
  const ready = persistence.load().then((state) => {
    if (state) store.restore(state);
  });
  void ready.catch((error: unknown) =>
    console.error(`[board] could not load runs: ${String(error)}`),
  );
  const removeStart = server.on("agent.turn_started", async ({ agent, turnId }) => {
    await ready;
    ensureActive();
    store.start(agent, turnId);
    await persistence.save(store.exportState());
  });
  const recaps = createRecapStore(path.join(home, "plugin-data/board/recaps.jsonl"));
  const removeEnd = server.on(
    "agent.turn_ended",
    async ({ agent, turnId, outcome, timeline }, { paseo }) => {
      await ready;
      ensureActive();
      store.end(agent, turnId, outcome);
      const saved = persistence.save(store.exportState());
      if (outcome.kind === "completed") {
        const reply = timeline.findLast((item) => item.type === "assistant_message");
        const fields = reply?.type === "assistant_message" ? parseRecap(reply.text) : null;
        if (fields) {
          const endedAt = new Date();
          // Recap placement and its file write remain detached from the run save.
          void paseo.agents
            .ref(agent.id)
            .refresh()
            .catch(() => null)
            .then((current) =>
              recaps.add(
                recapEntry(
                  agent,
                  turnId,
                  fields,
                  endedAt,
                  current?.project ?? null,
                  current?.agent.title,
                ),
              ),
            )
            .catch((error: unknown) =>
              console.error(`[board] could not save recap: ${String(error)}`),
            );
        }
      }
      await saved;
    },
  );
  let pending: Promise<void> | undefined;
  server.handle(starRunRpc, async ({ id, observingSince, starred }) => {
    await ready;
    ensureActive();
    const updated = store.setStarred(id, observingSince, starred);
    if (updated) await persistence.save(store.exportState());
    return { updated };
  });
  server.handle(removeRunRpc, async ({ id, observingSince, endedAt }) => {
    await ready;
    ensureActive();
    const removed = store.removeFinished(id, observingSince, endedAt);
    if (removed) await persistence.save(store.exportState());
    return { removed };
  });
  server.handle(recapsRpc, async ({ days }, { paseo }) => {
    const [grouped, { projects }] = await Promise.all([recaps.list(days), paseo.projects.list()]);
    const ids = new Map(
      projects.map((project) => [`project:${project.projectId}`, project.projectId]),
    );
    return {
      days: grouped.map((day) => ({
        ...day,
        projects: day.projects.map((project) => ({ ...project, projectId: ids.get(project.key) })),
      })),
    };
  });
  server.handle(boardRpc, async (_, { paseo }) => {
    await ready;
    ensureActive();
    if (!pending) {
      const revision = store.revision;
      pending = listRunning(paseo, controller.signal)
        .then(async (agents) => {
          ensureActive();
          store.reconcile(agents, revision);
          await Promise.all(
            store.unresolvedProjects().map(async ({ agentId, cwd }) => {
              // Placement enrichment must not hide the board when an agent is unavailable.
              const current = await paseo.agents
                .ref(agentId)
                .refresh()
                .catch(() => null);
              if (!controller.signal.aborted && current) {
                store.updateProject(agentId, cwd, current.project);
                store.updateTitle(agentId, current.agent.title);
              }
            }),
          );
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
    ensureActive();
    await persistence.save(store.exportState());
    const { projects } = await paseo.projects.list();
    const ids = new Map(
      projects.map((project) => [`project:${project.projectId}`, project.projectId]),
    );
    const snapshot = store.snapshot();
    return {
      ...snapshot,
      runs: snapshot.runs.map((run) => ({ ...run, projectId: ids.get(run.projectKey) })),
    };
  });
  return async () => {
    controller.abort();
    removeStart();
    removeEnd();
    await ready.catch(() => undefined);
    await persistence.flush();
    store.clear();
  };
}
