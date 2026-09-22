import assert from "node:assert/strict";
import test from "node:test";
import { createBranchReader, parseAheadBehind, parsePullRequest } from "../server/git";

test("parses rev-list left-right counts as behind/ahead", () => {
  assert.deepEqual(parseAheadBehind("1\t3\n"), { behind: 1, ahead: 3 });
  assert.equal(parseAheadBehind("fatal: no upstream"), null);
});

test("parses gh pr view JSON and rejects malformed output", () => {
  assert.deepEqual(
    parsePullRequest('{"number":42,"url":"https://github.com/o/r/pull/42","state":"OPEN"}'),
    {
      number: 42,
      url: "https://github.com/o/r/pull/42",
      state: "OPEN",
    },
  );
  assert.equal(parsePullRequest("not json"), null);
  assert.equal(parsePullRequest('{"url":"x"}'), null);
});

test("reads this repository and reports a non-git directory without throwing", async () => {
  const reader = createBranchReader();
  const here = await reader.get(process.cwd());
  assert.equal(here.repo, true);
  assert.ok(here.branch || here.detached);
  assert.ok(here.sha);
  const outside = await reader.get("/");
  assert.equal(outside.repo, false);
  assert.equal(outside.pr, null);
});
