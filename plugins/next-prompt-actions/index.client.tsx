import type { PluginClientContext } from "@getpaseo/plugin/client";
import { Platform } from "react-native";
import { desktopSupported, install } from "./client/web";
import { hostRpc, inspectRpc, sendRpc, toggleRpc } from "./shared/contracts";

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
  });
  return () => {
    cleanup();
    toggle();
  };
}
