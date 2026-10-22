import type { PluginServerContext } from "@getpaseo/plugin/server";
import { preferences, catalogRpc, activityRpc } from "./shared/spaces";
import { loadActivity, loadCatalog } from "./server/catalog";
export default function contribute(server: PluginServerContext) {
  server.registerSettings(preferences);
  server.handle(catalogRpc, (_, { paseo }) => loadCatalog(paseo));
  server.handle(activityRpc, (_, { paseo }) => loadActivity(paseo));
  return () => {};
}
