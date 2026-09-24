import type { PluginClientContext } from "@getpaseo/plugin/client";
import { installBranchPills } from "./client/pills";
import { createTurnDiffCard } from "./client/turn-diff-card";
import { selectFile, TurnDiffPanel } from "./client/turn-diff-panel";
import { prAttachments } from "./shared/pr-search";
import {
  TURN_DIFF_KIND,
  TURN_DIFF_PANEL,
  TURN_DIFF_VERSION,
  turnDiffSchema,
} from "./shared/turn-diff";

export default function contribute(client: PluginClientContext) {
  const removePills = installBranchPills(client);
  const removePanel = client.addWorkspacePanel({
    id: TURN_DIFF_PANEL,
    title: "Turn diff",
    icon: "FileDiff",
    context: "agent",
    Component: TurnDiffPanel,
  });
  const removeRenderer = client.addTimelineRenderer({
    kind: TURN_DIFF_KIND,
    version: TURN_DIFF_VERSION,
    schema: turnDiffSchema,
    Component: createTurnDiffCard((file, workspaceId) => {
      selectFile(file);
      client.openPanel(TURN_DIFF_PANEL, { workspaceId, agentId: file.agentId });
    }),
  });
  const removeAttachments = client.addAttachmentSource(prAttachments);
  return () => {
    removePills();
    removeRenderer();
    removePanel();
    removeAttachments();
  };
}
