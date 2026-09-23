import type { PluginServerContext } from "@getpaseo/plugin/server";
import { getThreadSnapshot, listThreads, searchThreadAttachments } from "./server/threads";
import { getThreadSnapshotRpc, listThreadsRpc, searchThreadsRpc } from "./shared/threads";

export default function contribute(server: PluginServerContext) {
  server.handle(listThreadsRpc, async (input, { paseo }) => ({
    threads: await listThreads(paseo, input),
  }));
  server.handle(getThreadSnapshotRpc, ({ agentId }, { paseo }) =>
    getThreadSnapshot(paseo, agentId),
  );
  server.handle(searchThreadsRpc, ({ query }, { paseo }) => searchThreadAttachments(query, paseo));
  return () => {};
}
