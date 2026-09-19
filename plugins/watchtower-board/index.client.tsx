import type { PluginClientContext } from "@getpaseo/plugin/client";
import { WatchtowerPanel } from "./client/board";
import { taskAttachments } from "./shared/board";

export default function contribute(client: PluginClientContext) {
  const removePanel = client.addWorkspacePanel({
    id: "board",
    title: "Watchtower",
    icon: "ListTodo",
    context: "workspace",
    locations: ["explorer"],
    Component: WatchtowerPanel,
  });
  const removeCommand = client.addCommandCenterItem({
    id: "open-board",
    title: "Open Watchtower board",
    icon: "ListTodo",
    context: "workspace",
    onSelect: ({ openPanel }) => openPanel("board", { location: "explorer" }),
  });
  const removeAttachments = client.addAttachmentSource(taskAttachments);
  return () => {
    removeAttachments();
    removeCommand();
    removePanel();
  };
}
