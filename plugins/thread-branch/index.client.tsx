import type { PluginClientContext } from "@getpaseo/plugin/client";
import { installBranchPills } from "./client/pills";

export default function contribute(client: PluginClientContext) {
  return installBranchPills(client);
}
