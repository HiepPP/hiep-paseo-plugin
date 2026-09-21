import type { PluginClientContext } from "@getpaseo/plugin/client";
import { installRemoveButtons } from "./client/remove";
import { installRemovePlacement } from "./client/web";
import { BoardPage } from "./client/page";
import { installBoardShortcut } from "./client/shortcut";

export default function contribute(client: PluginClientContext) {
  const surface = client.addSurface("board", BoardPage);
  const sidebar = client.addSidebarItem({
    id: "board",
    title: "Board",
    icon: "Columns3",
    surface: "board",
  });
  const shortcut = installBoardShortcut(() => client.openSurface("board"));
  const removePlacement = installRemovePlacement();
  const removeButtons = installRemoveButtons(client);
  return () => {
    removePlacement();
    removeButtons();
    shortcut();
    sidebar();
    surface();
  };
}
