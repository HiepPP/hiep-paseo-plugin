import assert from "node:assert/strict";
import test from "node:test";
import {
  addSpace,
  removeSpace,
  adjacent,
  membership,
  moveProject,
  projectKey,
  stateSchema,
} from "../shared/spaces";
import { createWheelGesture, touchDirection } from "../client/gesture";
import { loadCatalog } from "../server/catalog";
import type { PaseoApi } from "@getpaseo/client";

test("default membership and host identity survive round trips", () => {
  const initial = stateSchema.parse({});
  assert.equal(membership(initial, projectKey("a", "p")), "space-1");
  let state = addSpace(addSpace(initial));
  state = moveProject(state, projectKey("a", "p"), "space-3");
  const restored = stateSchema.parse(JSON.parse(JSON.stringify(state)));
  assert.equal(membership(restored, projectKey("a", "p")), "space-3");
  assert.equal(membership(restored, projectKey("b", "p")), "space-1");
  assert.equal(membership(initial, projectKey("a", "p")), "space-1");
  const back = moveProject(restored, projectKey("a", "p"), "space-1");
  assert.equal(membership(back, projectKey("a", "p")), "space-1");
  assert.throws(() => moveProject(state, "p", "missing"));
  assert.equal(state.spaces.length, 3);
  assert.equal(addSpace(state).spaces[3].name, "Workspace 4");
});
test("invalid stored data is rejected instead of resetting membership", () => {
  assert.equal(stateSchema.safeParse({ spaces: [] }).success, false);
  assert.equal(stateSchema.safeParse({ members: { p: "absent" } }).success, false);
  assert.equal(
    stateSchema.safeParse({
      spaces: [
        { id: "space-1", name: "1" },
        { id: "space-1", name: "2" },
      ],
    }).success,
    false,
  );
});
test("swipes respect direction, threshold, diagonal intent and endpoints", () => {
  assert.equal(touchDirection(-80, 10), 1);
  assert.equal(touchDirection(80, 10), -1);
  assert.equal(touchDirection(30, 0), 0);
  assert.equal(touchDirection(80, 90), 0);
  assert.equal(adjacent(["1", "2", "3"], "1", -1), "1");
  assert.equal(adjacent(["1", "2", "3"], "3", 1), "3");
  assert.equal(adjacent(["1", "2", "3"], "2", 1), "3");
});
test("trackpad momentum changes at most one Space until a quiet gap", () => {
  const wheel = createWheelGesture();
  assert.equal(wheel(40, 0, 0), 0);
  assert.equal(wheel(40, 0, 30), 1);
  assert.equal(wheel(100, 0, 60), 0);
  assert.equal(wheel(-100, 0, 500), -1);
  const vertical = createWheelGesture();
  assert.equal(vertical(90, 100, 0), 0);
});
test("catalog includes empty projects and all workspace pages without mutations", async () => {
  const requests: unknown[] = [];
  const fake = {
    projects: {
      list: async () => ({
        projects: [
          { projectId: "p", projectDisplayName: "P", projectRootPath: "/p" },
          { projectId: "empty", projectDisplayName: "Empty", projectRootPath: "/empty" },
        ],
      }),
    },
    workspaces: {
      list: async (options: unknown) => {
        requests.push(options);
        return requests.length === 1
          ? {
              entries: [{ id: "w1", projectId: "p", name: "One" }],
              pageInfo: { hasMore: true, nextCursor: "next" },
            }
          : {
              entries: [{ id: "w2", projectId: "p", name: "Two" }],
              pageInfo: { hasMore: false, nextCursor: null },
            };
      },
    },
  } as unknown as Pick<PaseoApi, "projects" | "workspaces">;
  const result = await loadCatalog(fake);
  assert.equal(result.projects.length, 2);
  assert.deepEqual(
    result.projects.find((p) => p.id === "p")?.workspaces.map((w) => w.id),
    ["w1", "w2"],
  );
  assert.deepEqual(requests[1], { page: { limit: 200, cursor: "next" } });
});

test("catalog rejects broken pagination rather than hiding missing workspaces", async () => {
  const fake = {
    projects: { list: async () => ({ projects: [] }) },
    workspaces: {
      list: async () => ({ entries: [], pageInfo: { hasMore: true, nextCursor: "repeated" } }),
    },
  } as unknown as Pick<PaseoApi, "projects" | "workspaces">;
  await assert.rejects(loadCatalog(fake), /Refresh to retry/);
});

test("removing a Space atomically moves every membership to its preceding neighbor", () => {
  const state = addSpace(addSpace(stateSchema.parse({})));
  state.members = { legacy: "space-2", '["view","repo"]': "space-2", other: "space-3" };
  const result = removeSpace(state, "space-2");
  assert.deepEqual(
    result.spaces.map((s) => s.id),
    ["space-1", "space-3"],
  );
  assert.equal(result.members.legacy, "space-1");
  assert.equal(result.members['["view","repo"]'], "space-1");
  assert.equal(result.members.other, "space-3");
  assert.equal(state.members.legacy, "space-2");
  assert.deepEqual(stateSchema.parse(JSON.parse(JSON.stringify(result))), result);
});
test("removing first Space uses next Space; last and stale removals are rejected", () => {
  const state = addSpace(stateSchema.parse({}));
  state.members.p = "space-1";
  const result = removeSpace(state, "space-1");
  assert.equal(result.members.p, "space-2");
  assert.equal(membership(result, "new-project"), "space-2");
  assert.throws(() => removeSpace(result, "space-2"), /at least one/);
  assert.throws(() => removeSpace(state, "missing"), /no longer exists/);
});
