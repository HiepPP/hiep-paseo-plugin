import type { PluginClientContext } from "@getpaseo/plugin/client";
import { settingsRpc } from "@getpaseo/plugin";
import { Platform } from "react-native";
import { SendSettingsScreen } from "./client/settings";
import { desktopSupported, install, openBoard } from "./client/web";
import { hostRpc, inspectRpc, sendRpc, toggleRpc } from "./shared/contracts";
import { sendSettings } from "./shared/settings";

export default function contribute(client: PluginClientContext) {
  if (Platform.OS !== "web" || !desktopSupported()) return () => {};
  const toggle = client.addCommandCenterItem({
    id: "toggle-auto-run",
    title: "Toggle Jev next-prompt auto-run",
    icon: "Send",
    context: "agent",
    async onSelect({ agent, workspace, rpc }) {
      const { serverId } = await rpc(hostRpc, {});
      const scope = { serverId, agentId: agent.id, workspaceId: workspace.id };
      const current = await rpc(inspectRpc, scope);
      await rpc(toggleRpc, { ...scope, enabled: !current.enabled });
    },
  });
  const cleanup = install({
    inspect: (scope) => client.rpc(inspectRpc, scope),
    send: (scope, key) => client.rpc(sendRpc, { ...scope, key }),
    async sent() {
      // The prompt is already sent; an unreadable setting only skips navigation.
      const saved = await client.rpc(settingsRpc(sendSettings.id).read, {}).catch(() => null);
      if (saved?.status === "ready" && sendSettings.schema.parse(saved.values).backToBoard)
        openBoard();
    },
  });
  const settings = client.addSettingsScreen({
    id: "send",
    title: "Next prompt actions",
    icon: "Send",
    Component: SendSettingsScreen,
  });
  return () => {
    cleanup();
    settings();
    toggle();
  };
}
