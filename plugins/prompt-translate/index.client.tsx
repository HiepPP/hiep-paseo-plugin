import type { PluginClientContext } from "@getpaseo/plugin/client";
import { settingsRpc } from "@getpaseo/plugin";
import { Platform } from "react-native";
import {
  enhanceRpc,
  originalRpc,
  translateRpc,
  prepareModeRpc,
  cancelModeRpc,
  bindQueueModeRpc,
  cancelQueueModeRpc,
} from "./shared/contracts";
import { translateSettings } from "./shared/settings";
import { installBubbles } from "./client/bubble";
import { createAgentModes } from "./client/agent-mode";
import { installComposer } from "./client/composer";
import { installComposerModeMenu } from "./client/mode-menu";
import { desktopSupported, type Doc, type Observer } from "./client/dom";
import { TranslateSettingsScreen } from "./client/settings";
import { current } from "./client/state";

export default function contribute(client: PluginClientContext) {
  if (Platform.OS !== "web" || !desktopSupported()) return () => {};
  const scope = globalThis as unknown as { document: Doc; MutationObserver: Observer };
  void client
    .rpc(settingsRpc(translateSettings.id).read, {})
    .then((saved) => {
      if (saved.status === "ready") current.apply(translateSettings.schema.parse(saved.values));
    })
    .catch(() => undefined);
  const bubbles = installBubbles(
    {
      translate: async (text, cacheOnly) =>
        (await client.rpc(translateRpc, { text, cacheOnly })).translation,
      original: async (text) => (await client.rpc(originalRpc, { text })).original,
    },
    { enabled: () => current.values.translate, activeSince: () => current.activeSince },
    scope.document,
    scope.MutationObserver,
  );
  const modes = createAgentModes(client);
  const modeMenu = installComposerModeMenu(client, scope.document, scope.MutationObserver, modes);
  current.onChange = () => {
    bubbles.scan();
    modeMenu.update();
  };
  const composer = installComposer(
    {
      mode: (id) => modes.ready(id),
      prepare: (input) => client.rpc(prepareModeRpc, input),
      bindQueue: (agentId, token, queueId) =>
        client.rpc(bindQueueModeRpc, { agentId, token, queueId }),
      cancelQueue: (agentId, queueId) => client.rpc(cancelQueueModeRpc, { agentId, queueId }),
      cancel: (agentId, token) => client.rpc(cancelModeRpc, { agentId, token }),
      enhance: async (text) => (await client.rpc(enhanceRpc, { text, deferCaveman: true })).prompt,
    },
    { enabled: () => current.values.enhanceShortcut, settings: () => current.values },
    scope.document,
  );
  const settings = client.addSettingsScreen({
    id: "translate",
    title: "Prompt translate",
    icon: "Languages",
    Component: TranslateSettingsScreen,
  });
  return () => {
    current.onChange = undefined;
    bubbles.stop();
    composer.stop();
    modeMenu.stop();
    settings();
  };
}
