import type { PluginClientContext } from "@getpaseo/plugin/client";
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
  return () => {
    shortcut();
    sidebar();
    surface();
  };
}
