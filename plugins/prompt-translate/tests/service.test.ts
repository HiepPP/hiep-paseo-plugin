import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Store } from "../server/store";
import { createService } from "../server/service";
import type { ChatRequest } from "../server/llm";
import { translateSettings, type TranslateSettings } from "../shared/settings";

async function setup(overrides: Partial<TranslateSettings> = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "pt-service-"));
  const store = new Store(path.join(dir, "cache.json"), undefined, 5);
  const requests: ChatRequest[] = [];
  const service = createService({
    store,
    complete: async (request) => {
      requests.push(request);
      return request.mode === "translate" ? `EN:${request.text}` : `PROMPT:${request.text}`;
    },
    settings: async () => ({ ...translateSettings.schema.parse({}), ...overrides }),
  });
  return { service, requests, store };
}

test("cacheOnly never calls the model, and a real translate fills the cache", async () => {
  const { service, requests, store } = await setup();
  assert.deepEqual(await service.translate({ text: "xin chào", cacheOnly: true }), {
    translation: null,
  });
  assert.deepEqual(await service.translate({ text: "xin chào", cacheOnly: false }), {
    translation: "EN:xin chào",
  });
  assert.deepEqual(await service.translate({ text: "xin chào", cacheOnly: true }), {
    translation: "EN:xin chào",
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].model, "google/gemini-2.5-flash-lite");
  store.close();
});

test("English text is rejected and translation off returns null without a call", async () => {
  const { service, requests, store } = await setup();
  await assert.rejects(service.translate({ text: "hello", cacheOnly: false }), {
    message: "Text has no Vietnamese to translate",
  });
  const off = await setup({ translate: false });
  assert.deepEqual(await off.service.translate({ text: "xin chào", cacheOnly: false }), {
    translation: null,
  });
  assert.equal(requests.length + off.requests.length, 0);
  store.close();
  off.store.close();
});

test("enhance uses the enhance model and records the original", async () => {
  const { service, requests, store } = await setup();
  assert.deepEqual(await service.enhance({ text: "sửa lỗi" }), { prompt: "PROMPT:sửa lỗi" });
  assert.equal(requests[0].model, "google/gemini-2.5-flash-lite");
  assert.deepEqual(await service.original({ text: "PROMPT:sửa lỗi" }), { original: "sửa lỗi" });
  assert.deepEqual(await service.original({ text: "sửa lỗi" }), { original: null });
  const off = await setup({ enhanceShortcut: false });
  await assert.rejects(off.service.enhance({ text: "sửa lỗi" }), {
    message: "Enhance shortcut is off",
  });
  store.close();
  off.store.close();
});
