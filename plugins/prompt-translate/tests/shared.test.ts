import { test } from "node:test";
import assert from "node:assert/strict";
import { hasVietnamese } from "../shared/vietnamese";
import { translateRpc } from "../shared/contracts";
import { translateSettings } from "../shared/settings";

test("hasVietnamese detects diacritics, including words shared with other languages", () => {
  assert.equal(hasVietnamese("cái này là gì"), true);
  assert.equal(hasVietnamese("ĐỔI TÊN HÀM"), true);
  assert.equal(hasVietnamese("rename the function"), false);
  assert.equal(hasVietnamese("fix src/app.ts:12 and run npm test"), false);
});

test("translate input rejects text over 20,000 characters and defaults cacheOnly", () => {
  assert.equal(translateRpc.input.safeParse({ text: "a".repeat(20_001) }).success, false);
  assert.deepEqual(translateRpc.input.parse({ text: "xin chào" }), {
    text: "xin chào",
    cacheOnly: false,
  });
});

test("settings parse {} into complete defaults", () => {
  assert.deepEqual(translateSettings.schema.parse({}), {
    translate: true,
    enhanceShortcut: true,
    provider: "openrouter",
    translateModel: "google/gemini-2.5-flash-lite",
    enhanceModel: "google/gemini-2.5-flash-lite",
  });
});
