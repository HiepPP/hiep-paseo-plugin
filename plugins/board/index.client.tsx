import type { PluginClientContext } from "@getpaseo/plugin/client";
import { Platform } from "react-native";
import { installNewThreadNavigation } from "./client/new-thread";
import { installParentNavigation } from "./client/parent";
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
  const parent = installParentNavigation(client);
  const newThread = installNewThreadNavigation(client);
  const removeButtons = installRemoveButtons(
    client,
    parent.open,
    Platform.OS === "web" ? newThread.open : undefined,
  );
  return () => {
    removePlacement();
    removeButtons();
    parent.cleanup();
    newThread.cleanup();
    shortcut();
    sidebar();
    surface();
  };
}
