import type { PluginServerContext } from "@getpaseo/plugin/server";
import { homedir } from "node:os";
import path from "node:path";
import { enhanceRpc, originalRpc, translateRpc } from "./shared/contracts";
import { translateSettings } from "./shared/settings";
import { resolveEndpoint } from "./server/credentials";
import { createCompleter } from "./server/llm";
import { createService } from "./server/service";
import { Store } from "./server/store";

export default function contribute(server: PluginServerContext) {
  const home = process.env.PASEO_HOME || path.join(homedir(), ".paseo");
  const configFile = path.join(home, "config.json");
  const settings = server.registerSettings(translateSettings);
  const store = new Store(path.join(home, "plugin-data/prompt-translate/cache.json"));
  const service = createService({
    store,
    complete: createCompleter((provider) => resolveEndpoint(provider, configFile)),
    async settings() {
      const current = await settings.read();
      // Invalid stored settings keep working on defaults until the user resets them.
      return current.status === "ready" ? current.values : translateSettings.schema.parse({});
    },
  });
  server.handle(translateRpc, (input) => service.translate(input));
  server.handle(enhanceRpc, (input) => service.enhance(input));
  server.handle(originalRpc, (input) => service.original(input));
  return () => store.close();
}
