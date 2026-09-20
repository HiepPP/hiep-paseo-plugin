import assert from "node:assert/strict";
import test from "node:test";
import type { PaseoApi } from "@getpaseo/client";
import { listRunning } from "../server/snapshot";

test("fetches every page and detects repeated cursors", async () => {
  let calls = 0;
  const client = {
    agents: {
      list: async () => ({
        entries: [],
        pageInfo: { hasMore: ++calls < 3, nextCursor: String(calls) },
      }),
    },
  } as unknown as PaseoApi;
  assert.deepEqual(await listRunning(client, new AbortController().signal), []);
  assert.equal(calls, 3);
  const repeated = {
    agents: {
      list: async () => ({ entries: [], pageInfo: { hasMore: true, nextCursor: "same" } }),
    },
  } as unknown as PaseoApi;
  await assert.rejects(listRunning(repeated, new AbortController().signal), /Refresh to retry/);
});
test("stopped plugin does not start an SDK request", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(listRunning({} as PaseoApi, controller.signal), /Board stopped/);
});
