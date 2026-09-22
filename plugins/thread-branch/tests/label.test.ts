import assert from "node:assert/strict";
import test from "node:test";
import { pillLabel, pillTitle } from "../client/label";
import { describePrPill } from "../client/buttons";
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
