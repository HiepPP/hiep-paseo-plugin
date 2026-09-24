import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { installComposer } from "../client/composer";
import type { Doc, El, Key } from "../client/dom";

type Sent = { key: string; metaKey: boolean; value: string | undefined };
function page(value: string) {
  const { document, window } = parseHTML(
    '<html><head></head><body><div data-testid="message-input-root"><textarea data-composer-input></textarea></div><p id="other"></p></body></html>',
  );
  // linkedom has no KeyboardEvent; Electron does.
  (window as unknown as Record<string, unknown>).KeyboardEvent = class extends window.Event {
    key: string;
    metaKey = false;
    constructor(type: string, init: { key: string; bubbles?: boolean; cancelable?: boolean }) {
      super(type, init);
      this.key = init.key;
    }
  };
  const field = document.querySelector("textarea") as unknown as El;
  field.value = value;
  const sent: Sent[] = [];
  (
    field as unknown as { addEventListener(n: string, h: (e: Sent) => void): void }
  ).addEventListener("keydown", (event) =>
    sent.push({ key: event.key, metaKey: event.metaKey, value: field.value }),
  );
  return { doc: document as unknown as Doc, field, sent, other: document.getElementById("other") };
}
const fast = { send: 0, verify: 20 };
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function key(target: unknown, init: Partial<Key> = {}) {
  const calls = { prevented: 0, stopped: 0 };
  const event: Key = {
    key: "Enter",
    metaKey: true,
    ctrlKey: false,
    shiftKey: false,
    isComposing: false,
    target,
    preventDefault: () => void calls.prevented++,
    stopImmediatePropagation: () => void calls.stopped++,
    ...init,
  };
  return { event, calls };
}
function deferred() {
  let resolve!: (value: string) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<string>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}
const badge = (doc: Doc) =>
  (doc as unknown as { querySelector(selector: string): El | null }).querySelector(
    "[data-prompt-translate-badge]",
  );
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("Cmd+Enter enhances the draft, then sends it with a plain Enter", async () => {
  const { doc, field, sent } = page("sửa lỗi");
  const pending = deferred();
  const requests: string[] = [];
  const composer = installComposer(
    { enhance: (text) => (requests.push(text), pending.promise) },
    { enabled: () => true },
    doc,
    fast,
  );
  const { event, calls } = key(field);
  composer.onKeydown(event);
  composer.onKeydown(key(field).event);
  assert.deepEqual(calls, { prevented: 1, stopped: 1 });
  assert.deepEqual(requests, ["sửa lỗi"]);
  assert.equal(badge(doc)?.textContent, "Enhancing… (Esc để hủy)");
  pending.resolve("Fix the bug.");
  await wait(5);
  assert.deepEqual(sent, [{ key: "Enter", metaKey: false, value: "Fix the bug." }]);
  // The host clears the composer after a successful send.
  field.value = "";
  await wait(30);
  assert.equal(badge(doc), null);
  composer.stop();
});

test("a send the host does not accept leaves the prompt and asks for Enter", async () => {
  const { doc, field } = page("sửa lỗi");
  const composer = installComposer(
    { enhance: async () => "Fix the bug." },
    { enabled: () => true },
    doc,
    fast,
  );
  composer.onKeydown(key(field).event);
  await wait(40);
  assert.equal(field.value, "Fix the bug.");
  assert.equal(badge(doc)?.textContent, "Chưa gửi được, nhấn Enter để gửi");
  composer.stop();
  assert.equal(badge(doc), null);
});

test("other keys, other targets, IME, and the disabled setting are untouched", () => {
  const { doc, field, other } = page("x");
  let enabled = true;
  const requests: string[] = [];
  const composer = installComposer(
    { enhance: async (text) => (requests.push(text), text) },
    { enabled: () => enabled },
    doc,
  );
  for (const init of [
    { metaKey: false },
    { shiftKey: true },
    { isComposing: true },
    { keyCode: 229 },
    { key: "a" },
  ]) {
    const { event, calls } = key(field, init);
    composer.onKeydown(event);
    assert.deepEqual(calls, { prevented: 0, stopped: 0 });
  }
  composer.onKeydown(key(other).event);
  enabled = false;
  composer.onKeydown(key(field).event);
  assert.equal(requests.length, 0);
  composer.stop();
});

test("Ctrl+Enter works too, and an edited draft is never overwritten", async () => {
  const { doc, field, sent } = page("bản nháp");
  const pending = deferred();
  const composer = installComposer(
    { enhance: () => pending.promise },
    { enabled: () => true },
    doc,
    fast,
  );
  composer.onKeydown(key(field, { metaKey: false, ctrlKey: true }).event);
  field.value = "bản nháp đã sửa";
  pending.resolve("Draft.");
  await settle();
  assert.equal(field.value, "bản nháp đã sửa");
  assert.deepEqual(sent, []);
  composer.stop();
});

test("Escape cancels, and errors keep the draft with a message", async () => {
  const { doc, field, sent } = page("hủy");
  const first = deferred();
  const second = deferred();
  const queue = [first.promise, second.promise];
  const composer = installComposer({ enhance: () => queue.shift()! }, { enabled: () => true }, doc);
  composer.onKeydown(key(field).event);
  const escape = key(field, { key: "Escape", metaKey: false });
  composer.onKeydown(escape.event);
  assert.deepEqual(escape.calls, { prevented: 1, stopped: 1 });
  first.resolve("Cancelled.");
  await settle();
  assert.equal(field.value, "hủy");
  assert.equal(badge(doc), null);
  composer.onKeydown(key(field).event);
  second.reject(new Error("timeout"));
  await settle();
  assert.equal(field.value, "hủy");
  assert.equal(badge(doc)?.textContent, "Enhance lỗi: timeout");
  assert.equal(sent.filter((event) => !event.metaKey).length, 0);
  composer.stop();
  assert.equal(badge(doc), null);
});
