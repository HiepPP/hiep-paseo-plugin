import type { PluginServerContext } from "@getpaseo/plugin/server";
import { homedir } from "node:os";
import path from "node:path";
import { boardSize } from "./shared/board-size";
import { orbSettings } from "./shared/orb";
import { projectColors } from "./shared/project-colors";
import { createRunStore } from "./server/store";
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
  const removeStart = server.on("agent.turn_started", ({ agent, turnId }) =>
    store.start(agent, turnId),
  );
  const home = process.env.PASEO_HOME || path.join(homedir(), ".paseo");
  const recaps = createRecapStore(path.join(home, "plugin-data/board/recaps.jsonl"));
  const removeEnd = server.on(
    "agent.turn_ended",
    ({ agent, turnId, outcome, timeline }, { paseo }) => {
      store.end(agent, turnId, outcome);
      if (outcome.kind !== "completed") return;
      const reply = timeline.findLast((item) => item.type === "assistant_message");
      const fields = reply?.type === "assistant_message" ? parseRecap(reply.text) : null;
      if (!fields) return;
      const endedAt = new Date();
      // Placement lookup and the file write run detached so the lifecycle hook returns at once.
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
        .catch((error: unknown) => console.error(`[board] could not save recap: ${String(error)}`));
    },
  );
  let pending: Promise<void> | undefined;
  server.handle(starRunRpc, ({ id, observingSince, starred }) => ({
    updated: store.setStarred(id, observingSince, starred),
  }));
  server.handle(removeRunRpc, ({ id, observingSince, endedAt }) => ({
    removed: store.removeFinished(id, observingSince, endedAt),
  }));
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
    if (!pending) {
      const revision = store.revision;
      pending = listRunning(paseo, controller.signal)
        .then(async (agents) => {
          if (!controller.signal.aborted) store.reconcile(agents, revision);
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
  return () => {
    controller.abort();
    removeStart();
    removeEnd();
    store.clear();
  };
}
