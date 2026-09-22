import type { PluginServerContext } from "@getpaseo/plugin/server";
import { createBranchReader } from "./server/git";
import { getBranchRpc } from "./shared/branch";

export default function contribute(server: PluginServerContext) {
  const reader = createBranchReader();
  server.handle(getBranchRpc, ({ cwd, force }) => reader.get(cwd, force === true));
  return () => {};
}
