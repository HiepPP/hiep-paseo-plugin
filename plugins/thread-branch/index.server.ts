import type { PluginServerContext } from "@getpaseo/plugin/server";
import { createBranchReader, run } from "./server/git";
import { createPrSearch, listWorkspaceDirs } from "./server/pr-search";
import { createTurnDiffTracker, readFileDiff, readFileImage } from "./server/turn-diff";
import { getBranchRpc } from "./shared/branch";
import { searchPrsRpc } from "./shared/pr-search";
import { fileDiffRpc, fileImageRpc, TURN_DIFF_KIND, TURN_DIFF_VERSION } from "./shared/turn-diff";

export default function contribute(server: PluginServerContext) {
  const reader = createBranchReader();
  const diffs = createTurnDiffTracker();
  const prs = createPrSearch();
  const log = (line: string) => console.warn(`[thread-branch] ${line}`);
  server.handle(getBranchRpc, ({ cwd, force, fetch }) =>
    reader.get(cwd, force === true || fetch === true, fetch === true),
  );
  server.handle(searchPrsRpc, ({ query }, { paseo }) =>
    prs.search(query, () => listWorkspaceDirs(paseo)),
  );
  server.handle(fileDiffRpc, (input) => readFileDiff((args, cwd) => run("git", args, cwd), input));
  server.handle(fileImageRpc, (input) => readFileImage(input));
  const started = server.on("agent.turn_started", ({ agent, turnId }) => {
    void diffs.started(agent, turnId);
  });
  const ended = server.on("agent.turn_ended", ({ agent, turnId }, { paseo }) => {
    // Git snapshots run detached so the lifecycle hook returns immediately.
    void diffs
      .ended(agent, turnId)
      .then(async (row) => {
        if (!row) return;
        await paseo.agents.ref(agent.id).timeline.append({
          type: "plugin",
          id: row.rowId,
          kind: TURN_DIFF_KIND,
          version: TURN_DIFF_VERSION,
          data: row.diff,
        });
      })
      .catch((error) => log(`turn diff failed: ${error instanceof Error ? error.message : error}`));
  });
  return () => {
    started();
    ended();
  };
}
