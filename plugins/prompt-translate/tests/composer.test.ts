import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { installComposer } from "../client/composer";
import type { Doc, El, Key } from "../client/dom";
import { translateSettings } from "../shared/settings";

type Sent = { key: string; metaKey: boolean; value: string | undefined };
function page(value: string) {
  const { document, window } = parseHTML(
    '<html><head></head><body><div data-testid="message-input-root"><textarea data-composer-input></textarea><button id="send" role="button">Send</button></div><p id="other"></p></body></html>',
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
  Object.assign(field, {
    __reactFiber$test: { memoizedProps: { voiceAgentId: "0c5be16b-a9e0-44c4-8caa-db8aff761e2f" } },
  });
  field.value = value;
  const sent: Sent[] = [];
  (
    field as unknown as { addEventListener(n: string, h: (e: Sent) => void): void }
  ).addEventListener("keydown", (event) =>
    sent.push({ key: event.key, metaKey: event.metaKey, value: field.value }),
  );
  return { doc: document as unknown as Doc, field, sent, other: document.getElementById("other") };
}
const prepared: { mode: string; text: string; source: string }[] = [];
let selected: typeof follow.cavemanMode = "follow-agent";
const hookApi = {
  bindQueue: async () => ({}),
  cancelQueue: async () => ({}),
  mode: async () => selected,
  prepare: async (input: { mode: typeof selected; text: string; source: string }) => {
    prepared.push(input);
    return { token: "test" };
  },
  cancel: async () => ({}),
};
const fast = { send: 0, verify: 20 };
const follow = translateSettings.schema.parse({});
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
    { ...hookApi, enhance: (text) => (requests.push(text), pending.promise) },
    { enabled: () => true, settings: () => follow },
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
  assert.equal(sent.length, 1);
  assert.equal(sent[0].value, "Fix the bug.");
  // The host clears the composer after a successful send.
  field.value = "";
  await wait(30);
  assert.equal(badge(doc), null);
  composer.stop();
});

test("a send the host does not accept leaves the prompt and asks for Enter", async () => {
  const { doc, field } = page("sửa lỗi");
  const composer = installComposer(
    { ...hookApi, enhance: async () => "Fix the bug." },
    { enabled: () => true, settings: () => follow },
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
    { ...hookApi, enhance: async (text) => (requests.push(text), text) },
    { enabled: () => enabled, settings: () => follow },
    doc,
  );
  for (const init of [{ shiftKey: true }, { isComposing: true }, { keyCode: 229 }, { key: "a" }]) {
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
    { ...hookApi, enhance: () => pending.promise },
    { enabled: () => true, settings: () => follow },
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
  const composer = installComposer(
    { ...hookApi, enhance: () => queue.shift()! },
    { enabled: () => true, settings: () => follow },
    doc,
  );
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

test("ordinary turns snapshot selected mode without changing text", async () => {
  const { doc, field, sent } = page("Giải thích git status.");
  const composer = installComposer(
    { ...hookApi, enhance: async (text) => text },
    { enabled: () => true, settings: () => follow },
    doc,
  );
  try {
    for (const mode of ["follow-agent", "wenyan-ultra", "lite", "follow-agent"] as const) {
      selected = mode;
      composer.onKeydown(key(field, { metaKey: false }).event);
      await settle();
      assert.equal(prepared.at(-1)?.mode, mode);
      assert.equal(sent.at(-1)?.value, "Giải thích git status.");
      assert.equal(field.value, "Giải thích git status.");
    }
  } finally {
    composer.stop();
  }
});

test("button send waits for hook preparation and keeps original text", async () => {
  const { doc, field } = page("click turn");
  const composer = installComposer(
    { ...hookApi, enhance: async (text) => text },
    { enabled: () => true, settings: () => follow },
    doc,
  );
  const button = field.parentElement!.querySelector("#send")!;
  let clicked = 0;
  button.addEventListener("click", () => {
    clicked++;
  });
  composer.onClick({
    target: button,
    preventDefault() {},
    stopPropagation() {},
    stopImmediatePropagation() {},
  });
  assert.equal(clicked, 0);
  await settle();
  assert.equal(clicked, 1);
  assert.equal(field.value, "click turn");
  composer.stop();
});

test("Enter leaves compact drafts and autocomplete selection untouched", () => {
  const { doc, field } = page("draft");
  const settings = translateSettings.schema.parse({ cavemanMode: "lite" });
  const composer = installComposer(
    { ...hookApi, enhance: async (text) => text },
    { enabled: () => true, settings: () => settings },
    doc,
  );
  try {
    const view = doc.defaultView!;
    view.innerWidth = 600;
    composer.onKeydown(key(field, { metaKey: false }).event);
    assert.equal(field.value, "draft");
    view.innerWidth = 1000;
    const popover = doc.createElement("div");
    popover.setAttribute("data-testid", "composer-autocomplete-popover");
    doc.body.append(popover);
    composer.onKeydown(key(field, { metaKey: false }).event);
    assert.equal(field.value, "draft");
  } finally {
    composer.stop();
  }
});

test("enhancement reads the latest mode at send, including a change after completion", async () => {
  const { doc, field, sent } = page("Giải thích git status.");
  const pending = deferred();
  let settings = translateSettings.schema.parse({ cavemanMode: "wenyan-ultra" });
  selected = "wenyan-ultra";
  const composer = installComposer(
    { ...hookApi, enhance: () => pending.promise },
    { enabled: () => true, settings: () => settings },
    doc,
    { send: 20, verify: 100 },
  );
  try {
    composer.onKeydown(key(field).event);
    settings = translateSettings.schema.parse({ cavemanMode: "lite" });
    pending.resolve("Explain git status.");
    await settle();
    settings = follow;
    selected = "follow-agent";
    await wait(30);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].value, "Explain git status.");
    assert.equal(prepared.at(-1)?.mode, "follow-agent");
    assert.equal(prepared.at(-1)?.source, "Giải thích git status.");
  } finally {
    composer.stop();
  }
});

test("manual command survives enhancement despite a conflicting dropdown", async () => {
  const { doc, field, sent } = page("/caveman lite\n\nGiải thích git status.");
  const composer = installComposer(
    { ...hookApi, enhance: async () => "/caveman lite\n\nExplain git status." },
    { enabled: () => true, settings: () => follow },
    doc,
    fast,
  );
  try {
    composer.onKeydown(key(field).event);
    await wait(10);
    assert.equal(sent[0].value, "/caveman lite\n\nExplain git status.");
  } finally {
    composer.stop();
  }
});

test("selection changing during prepare cancels the old snapshot", async () => {
  const { doc, field, sent } = page("unchanged");
  selected = "lite";
  const cancelled: string[] = [];
  let count = 0;
  const composer = installComposer(
    {
      ...hookApi,
      enhance: async (text) => text,
      prepare: async () => {
        count++;
        if (count === 1) selected = "ultra";
        return { token: String(count) };
      },
      cancel: async (_id, token) => {
        cancelled.push(token);
      },
    },
    { enabled: () => true, settings: () => follow },
    doc,
  );
  composer.onKeydown(key(field, { metaKey: false }).event);
  await settle();
  assert.deepEqual(cancelled, ["1"]);
  assert.equal(count, 2);
  assert.equal(sent[0].value, "unchanged");
  composer.stop();
});

test("prepare failure does not send or modify the draft", async () => {
  const { doc, field, sent } = page("original");
  const composer = installComposer(
    {
      ...hookApi,
      enhance: async (text) => text,
      prepare: async () => {
        throw Error("hook unavailable");
      },
    },
    { enabled: () => true, settings: () => follow },
    doc,
  );
  composer.onKeydown(key(field, { metaKey: false }).event);
  await settle();
  assert.equal(sent.length, 0);
  assert.equal(field.value, "original");
  assert.match(badge(doc)?.textContent ?? "", /hook unavailable/);
  composer.stop();
});

test("Stop and voice buttons are never intercepted", () => {
  const { doc, field } = page("");
  const composer = installComposer(
    { ...hookApi, enhance: async (text) => text },
    { enabled: () => true, settings: () => follow },
    doc,
  );
  const button = field.parentElement!.querySelector("#send")!;
  let prevented = 0;
  const event = {
    target: button,
    preventDefault() {
      prevented++;
    },
    stopPropagation() {},
    stopImmediatePropagation() {},
  };
  composer.onClick(event);
  field.value = "draft while running";
  Object.assign(button, {
    __reactFiber$test: { memoizedProps: { onDefaultSendAction() {}, canPressLoadingButton: true } },
  });
  composer.onClick(event);
  assert.equal(prevented, 0);
  composer.stop();
});

test("switching agents while enhancement runs never sends into the new conversation", async () => {
  const { doc, field, sent } = page("draft");
  const result = deferred();
  const composer = installComposer(
    { ...hookApi, enhance: () => result.promise },
    { enabled: () => true, settings: () => follow },
    doc,
    fast,
  );
  composer.onKeydown(key(field).event);
  Object.assign(field, {
    __reactFiber$test: { memoizedProps: { voiceAgentId: "00000000-0000-4000-8000-000000000099" } },
  });
  result.resolve("enhanced");
  await wait(10);
  assert.equal(sent.length, 0);
  assert.equal(field.value, "draft");
  composer.stop();
});

test("queue edit waits for exact snapshot cancellation before restoring draft", async () => {
  const { doc, field } = page("same");
  const row = doc.createElement("div");
  const edit = doc.createElement("button");
  edit.setAttribute("aria-label", "Edit queued message");
  Object.assign(edit, {
    __reactFiber$test: {
      memoizedProps: {
        item: { id: "queue-one", text: "same" },
        onEdit() {},
        onSendNow() {},
        editLabel: "Edit queued message",
      },
    },
  });
  row.append(edit);
  let bound = "";
  let cancelled = "";
  let restored = false;
  const cancel = deferred();
  const composer = installComposer(
    {
      ...hookApi,
      enhance: async (x) => x,
      bindQueue: async (_agent, token, id) => {
        bound = `${token}:${id}`;
      },
      cancelQueue: async (_agent, id) => {
        cancelled = id;
        await cancel.promise;
      },
    },
    { enabled: () => true, settings: () => follow },
    doc,
  );
  field.addEventListener("keydown", () => {
    field.value = "";
    field.parentElement!.append(row);
  });
  composer.onKeydown(key(field, { metaKey: false }).event);
  await wait(10);
  assert.equal(bound, "test:queue-one");
  edit.addEventListener("click", () => {
    restored = true;
  });
  composer.onClick({
    target: edit,
    preventDefault() {},
    stopPropagation() {},
    stopImmediatePropagation() {},
  });
  await settle();
  assert.equal(cancelled, "queue-one");
  assert.equal(restored, false);
  cancel.resolve("");
  await settle();
  assert.equal(restored, true);
  composer.stop();
});

test("new-thread draft sends unchanged without calling agent mode RPCs", async () => {
  const { doc, field, sent } = page("first prompt");
  Object.assign(field, {
    __reactFiber$test: { memoizedProps: { voiceAgentId: "new-workspace" } },
  });
  let modeCalls = 0;
  const composer = installComposer(
    {
      ...hookApi,
      enhance: async (text) => text,
      mode: async () => {
        modeCalls++;
        throw new Error("Invalid UUID");
      },
    },
    { enabled: () => true, settings: () => follow },
    doc,
    fast,
  );
  try {
    composer.onKeydown(key(field, { metaKey: false }).event);
    await settle();
    assert.equal(modeCalls, 0);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].value, "first prompt");
  } finally {
    composer.stop();
  }
});
