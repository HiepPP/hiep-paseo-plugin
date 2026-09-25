import { test } from "node:test";
import assert from "node:assert/strict";
import { commitPrompt, parsePrompts } from "../shared/prompts";

test("commit suggestions receive the skill once and preserve scope", () => {
  assert.equal(
    commitPrompt("Commit thay đổi. Không push."),
    "/commit\nCommit thay đổi. Không push.",
  );
  assert.equal(commitPrompt("Review, then COMMIT."), "/commit\nReview, then COMMIT.");
  assert.equal(commitPrompt("/commit\nKeep unrelated work."), "/commit\nKeep unrelated work.");
  assert.equal(commitPrompt("Review the commitment."), null);
  assert.equal(commitPrompt("Run tests."), null);
});

test("headings, multiline Vietnamese, multiple suggestions, and marker removal", () => {
  assert.deepEqual(
    parsePrompts(
      "## What Next\n```text\nprompt: Kiểm tra UI.\nGiữ nguyên WIP.\nprompt: Báo kết quả.\n```",
    ),
    [
      {
        block: "prompt: Kiểm tra UI.\nGiữ nguyên WIP.\nprompt: Báo kết quả.",
        prompts: ["Kiểm tra UI.\nGiữ nguyên WIP.", "Báo kết quả."],
        whys: ["", ""],
      },
    ],
  );
  assert.equal(parsePrompts("## Next Steps\n~~~\nprompt: Test.\n~~~").length, 1);
});
test("a why: line under a prompt is its reason, not prompt text", () => {
  const [parsed] = parsePrompts(
    "## What Next\n```\nprompt: Commit.\nwhy: Locks in the fix.\nprompt: Push.\n```",
  );
  assert.deepEqual(parsed.prompts, ["Commit.", "Push."]);
  assert.deepEqual(parsed.whys, ["Locks in the fix.", ""]);
  assert.deepEqual(parsePrompts("## What Next\n```\nwhy: Orphan.\nprompt: Test.\n```"), []);
});
test("ignore incomplete streams, ordinary code, quotes, empty entries, and other sections", () => {
  for (const text of [
    "```\nprompt: Test\n```",
    "## Next Steps\n```js\nprompt: test\n```",
    "> ## Next Steps\n> ```\n> prompt: Test\n> ```",
    "## Next Steps\n```\nprompt: Test",
    "## Next Steps\n```\nprompt: \n```",
    "## Next Steps\n## Example\n```\nprompt: Test\n```",
    "## Next Steps\n```\nexample\nprompt: Test\n```",
  ])
    assert.deepEqual(parsePrompts(text), []);
});
test("headings inside a code fence cannot enable prompt parsing", () => {
  assert.deepEqual(parsePrompts("````\n## Next Steps\n```\nprompt: Test\n```\n````"), []);
});
