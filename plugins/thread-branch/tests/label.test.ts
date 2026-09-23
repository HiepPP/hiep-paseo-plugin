import assert from "node:assert/strict";
import test from "node:test";
import { pillLabel, pillTitle } from "../client/label";
import { describePrPill, describeRepoPill, describeSyncPill } from "../client/buttons";
import type { BranchInfo } from "../shared/branch";

const base: BranchInfo = {
  repo: true,
  branch: "feat/board-avatars",
  detached: false,
  sha: "a1b2c3d",
  dirty: false,
  upstream: null,
  ahead: null,
  behind: null,
  pr: null,
  remoteUrl: null,
  prLookup: "ok",
};

test("label shows branch without PR suffix, detached sha, and truncation", () => {
  assert.equal(pillLabel(base), "feat/board-avatars");
  assert.equal(
    pillLabel({
      ...base,
      pr: { number: 42, url: "https://github.com/o/r/pull/42", state: "OPEN" },
    }),
    "feat/board-avatars",
  );
  assert.equal(pillLabel({ ...base, branch: null, detached: true }), "@a1b2c3d");
  assert.equal(
    pillLabel({ ...base, branch: "feature/very-long-branch-name-that-overflows" }),
    "feature/very-long-branc…",
  );
});

test("title carries upstream, sync counts, dirty state, and PR state", () => {
  assert.equal(
    pillTitle({
      ...base,
      upstream: "origin/feat/board-avatars",
      ahead: 2,
      behind: 0,
      dirty: true,
      pr: { number: 42, url: "https://github.com/o/r/pull/42", state: "OPEN" },
    }),
    "Branch feat/board-avatars · tracks origin/feat/board-avatars · ahead 2 / behind 0 · uncommitted changes · PR #42 open",
  );
});

test("PR pill is a one-click action, hidden without a pull request", () => {
  const open = async () => {};
  assert.equal(describePrPill(base, open).visible, false);
  const withPr = describePrPill(
    { ...base, pr: { number: 7, url: "https://github.com/o/r/pull/7", state: "OPEN" } },
    open,
  );
  assert.equal(withPr.visible, true);
  assert.equal(withPr.label, "#7");
  assert.equal(withPr.behavior.kind, "action");
});

test("repo pill shows the repository name and hides without a web remote", () => {
  const open = async () => {};
  assert.equal(describeRepoPill(base, open).visible, false);
  const pill = describeRepoPill({ ...base, remoteUrl: "https://github.com/o/r" }, open);
  assert.equal(pill.visible, true);
  assert.equal(pill.label, "r");
  assert.equal(pill.icon, "Github");
  assert.equal(pill.title, "Open https://github.com/o/r");
});

test("sync pill shows commits to push and pull, hidden when in sync or untracked", async () => {
  let refreshed = 0;
  const refresh = async () => {
    refreshed += 1;
  };
  const tracked = { ...base, upstream: "origin/feat/board-avatars" };
  assert.equal(describeSyncPill(base, refresh).visible, false);
  assert.equal(describeSyncPill({ ...tracked, ahead: 0, behind: 0 }, refresh).visible, false);
  const ahead = describeSyncPill({ ...tracked, ahead: 2, behind: 0 }, refresh);
  assert.equal(ahead.visible, true);
  assert.equal(ahead.label, "↑2 | ↓0");
  assert.equal(ahead.title, "2 to push vs origin/feat/board-avatars · click to refresh");
  const both = describeSyncPill({ ...tracked, ahead: 2, behind: 3 }, refresh);
  assert.equal(both.label, "↑2 | ↓3");
  assert.equal(both.title, "2 to push, 3 to pull vs origin/feat/board-avatars · click to refresh");
  assert.equal(describeSyncPill({ ...tracked, ahead: 0, behind: 1 }, refresh).label, "↑0 | ↓1");
  assert.equal(both.behavior.kind, "action");
  if (both.behavior.kind === "action") await both.behavior.onPress();
  assert.equal(refreshed, 1);
});
