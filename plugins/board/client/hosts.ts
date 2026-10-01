import type { PluginClientContext } from "@getpaseo/plugin/client";
import { boardHostRpc } from "../shared/board";

export type BoardHostClient = Pick<PluginClientContext, "rpc"> & {
  openNewWorkspace?: (input: {
    serverId?: string;
    cwd: string;
    name?: string;
    projectId?: string;
  }) => void;
};
export type BoardHostEntry = BoardHostClient & { serverId: string };

// Each installation has its own evaluated bundle. Share only Board's host-bound
// capabilities, never a selected-host hook or a separate authenticated connection.
const key = Symbol.for("paseo.board.hosts.v1");
type Registry = {
  entries: readonly BoardHostEntry[];
  listeners: Set<() => void>;
  retry: Set<() => void>;
  nextVersion: number;
  versions: Map<string, number>;
};
const shared = globalThis as typeof globalThis & { [key]?: Registry };
const registry: Registry = (shared[key] ??= {
  entries: [],
  listeners: new Set(),
  retry: new Set(),
  nextVersion: 0,
  versions: new Map(),
});
const publish = () => {
  for (const listener of registry.listeners) listener();
};
export const getBoardHosts = () => registry.entries;
export function subscribeBoardHosts(listener: () => void) {
  registry.listeners.add(listener);
  return () => {
    registry.listeners.delete(listener);
  };
}
export function refreshBoardHosts() {
  for (const retry of registry.retry) retry();
}

export function registerBoardHost(client: BoardHostClient) {
  const version = ++registry.nextVersion;
  let stopped = false;
  let pending = false;
  let entry: BoardHostEntry | undefined;
  const ensureActive = () => {
    if (stopped || !entry || !registry.entries.includes(entry))
      throw new Error("Board host installation changed. Refresh and retry.");
  };
  const resolve = () => {
    if (stopped || pending || entry) return;
    pending = true;
    void Promise.resolve()
      .then(() => client.rpc(boardHostRpc, {}))
      .then(({ serverId }) => {
        if (stopped) return;
        if ((registry.versions.get(serverId) ?? 0) > version) {
          stopped = true;
          registry.retry.delete(resolve);
          return;
        }
        registry.versions.set(serverId, version);
        entry = {
          serverId,
          rpc: (contract, input) => {
            ensureActive();
            return client.rpc(contract, input);
          },
          ...(client.openNewWorkspace
            ? {
                openNewWorkspace: (
                  input: Parameters<NonNullable<BoardHostClient["openNewWorkspace"]>>[0],
                ) => {
                  ensureActive();
                  client.openNewWorkspace!({ ...input, serverId });
                },
              }
            : {}),
        };
        registry.entries = [
          ...registry.entries.filter((item) => item.serverId !== serverId),
          entry,
        ];
        registry.retry.delete(resolve);
        publish();
      })
      .catch(() => {
        // Retry on host reconnection or the Board's next refresh.
      })
      .finally(() => {
        pending = false;
      });
  };
  registry.retry.add(resolve);
  resolve();
  return () => {
    stopped = true;
    registry.retry.delete(resolve);
    if (entry && registry.entries.includes(entry)) {
      registry.entries = registry.entries.filter((item) => item !== entry);
      publish();
    }
  };
}
