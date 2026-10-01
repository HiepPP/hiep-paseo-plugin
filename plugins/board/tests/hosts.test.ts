import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import type * as Hosts from "../client/hosts";
import type { BoardHostClient } from "../client/hosts";

const code = ts.transpileModule(
  readFileSync(new URL("../client/hosts.ts", import.meta.url), "utf8"),
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  },
).outputText;
function load(shared: object) {
  const exports = {} as typeof Hosts;
  runInNewContext(code, {
    exports,
    globalThis: shared,
    require: () => ({ boardHostRpc: { name: "board.host" } }),
  });
  return exports;
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
function client(serverId: string, calls: unknown[] = []): BoardHostClient {
  return {
    rpc: (async (contract: { name: string }, input: unknown) => {
      calls.push([serverId, contract.name, input]);
      return contract.name === "board.host" ? { serverId } : { updated: true };
    }) as BoardHostClient["rpc"],
    openNewWorkspace: (input) => {
      calls.push([serverId, "new", input]);
    },
  };
}

test("separate bundles share both hosts and keep identical IDs routed to their owner", async () => {
  const shared = {};
  const air = load(shared);
  const mini = load(shared);
  const calls: unknown[] = [];
  let notifications = 0;
  const unsubscribe = air.subscribeBoardHosts(() => notifications++);
  const stopAir = air.registerBoardHost(client("air", calls));
  const stopMini = mini.registerBoardHost(client("mini", calls));
  await flush();
  assert.equal(air.getBoardHosts(), mini.getBoardHosts());
  assert.equal(air.getBoardHosts(), air.getBoardHosts());
  assert.equal(air.getBoardHosts().length, 2);
  const contract = { name: "board.set-starred" } as any;
  for (const host of air.getBoardHosts()) await host.rpc(contract, { id: "same-id" });
  assert.deepEqual(JSON.parse(JSON.stringify(calls.slice(2))), [
    ["air", "board.set-starred", { id: "same-id" }],
    ["mini", "board.set-starred", { id: "same-id" }],
  ]);
  assert.equal(notifications, 2);
  stopAir();
  stopMini();
  unsubscribe();
  assert.equal(air.getBoardHosts().length, 0);
});

test("reload disposal cannot remove a replacement or use an old endpoint", async () => {
  const hosts = load({});
  const stopOld = hosts.registerBoardHost(client("air"));
  await flush();
  const old = hosts.getBoardHosts()[0];
  const stopNew = hosts.registerBoardHost(client("air"));
  await flush();
  stopOld();
  assert.equal(hosts.getBoardHosts().length, 1);
  assert.notEqual(hosts.getBoardHosts()[0], old);
  assert.throws(() => old.rpc({} as any, {}), /installation changed/);
  stopNew();
});

test("late host resolution after unload never registers", async () => {
  const hosts = load({});
  let finish!: (value: any) => void;
  const stop = hosts.registerBoardHost({
    rpc: (() =>
      new Promise((resolve) => {
        finish = resolve;
      })) as any,
  });
  await flush();
  stop();
  finish({ serverId: "air" });
  await flush();
  assert.equal(hosts.getBoardHosts().length, 0);
});

test("an older pending installation cannot replace a newer resolved installation", async () => {
  const hosts = load({});
  let finish!: (value: any) => void;
  const stopOld = hosts.registerBoardHost({
    rpc: (() =>
      new Promise((resolve) => {
        finish = resolve;
      })) as any,
  });
  const stopNew = hosts.registerBoardHost(client("air"));
  await flush();
  const current = hosts.getBoardHosts()[0];
  finish({ serverId: "air" });
  await flush();
  assert.equal(hosts.getBoardHosts()[0], current);
  stopOld();
  stopNew();
});

test("a failed registration retries once requested and stops after cleanup", async () => {
  const hosts = load({});
  let attempts = 0;
  const stop = hosts.registerBoardHost({
    rpc: (async () => {
      if (++attempts === 1) throw new Error("offline");
      return { serverId: "mini" };
    }) as any,
  });
  await flush();
  assert.equal(hosts.getBoardHosts().length, 0);
  hosts.refreshBoardHosts();
  hosts.refreshBoardHosts();
  await flush();
  assert.equal(attempts, 2);
  assert.equal(hosts.getBoardHosts().length, 1);
  stop();
  hosts.refreshBoardHosts();
  await flush();
  assert.equal(attempts, 2);
});
