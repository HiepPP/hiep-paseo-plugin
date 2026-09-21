import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePrompts } from "../shared/prompts";

test("headings, multiline Vietnamese, multiple suggestions, and marker removal", () => {
  assert.deepEqual(
    parsePrompts(
      "## What Next\n```text\nprompt: Kiểm tra UI.\nGiữ nguyên WIP.\nprompt: Báo kết quả.\n```",
    ),
    [
      {
        block: "prompt: Kiểm tra UI.\nGiữ nguyên WIP.\nprompt: Báo kết quả.",
        prompts: ["Kiểm tra UI.\nGiữ nguyên WIP.", "Báo kết quả."],
      },
    ],
  );
  assert.equal(parsePrompts("## Next Steps\n~~~\nprompt: Test.\n~~~").length, 1);
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
