import type { PluginClientContext } from "@getpaseo/plugin/client";
import { settingsRpc } from "@getpaseo/plugin";
import { Platform } from "react-native";
import { enhanceRpc, originalRpc, translateRpc } from "./shared/contracts";
import { translateSettings } from "./shared/settings";
import { installBubbles } from "./client/bubble";
import { installComposer } from "./client/composer";
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
  current.onChange = () => bubbles.scan();
  const composer = installComposer(
    { enhance: async (text) => (await client.rpc(enhanceRpc, { text })).prompt },
    { enabled: () => current.values.enhanceShortcut },
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
    settings();
  };
}
