import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { binding, install, type Node, type Binding } from "../client/web";
import type { Snapshot } from "../shared/contracts";
import { Engine, type Current } from "../server/engine";
import { Store } from "../server/store";

const context: Binding = {
  agentId: "a",
  serverId: "h",
  workspaceId: "w",
  message: "## Next Steps\n```\nprompt: Test UI.\n```",
  timestamp: 100,
};
const snapshot: Snapshot = {
  enabled: false,
  busy: false,
  note: "",
  candidates: [
    {
      key: "key",
      block: "prompt: Test UI.",
      text: "Test UI.",
      source: context.message,
      timestamp: 100,
      state: "ready",
    },
  ],
};
const pause = () => new Promise((r) => setTimeout(r, 170));

test("DOM button preserves code/copy/draft; sends once and cleans up on disable", async () => {
  const { document, window } = parseHTML(
    '<html><head></head><body><textarea>unsent draft</textarea><div data-testid="assistant-message"><div data-paseo-markdown-tag="pre"><span data-paseo-markdown-tag="code">prompt: Test UI.</span><button id="copy">Copy</button></div></div></body></html>',
  );
  const previous = Object.getOwnPropertyDescriptor(globalThis, "MutationObserver");
  Object.defineProperty(globalThis, "MutationObserver", {
    value: window.MutationObserver,
    configurable: true,
  });
  let sends = 0;
  // Paseo may split one canonical response into a separate fence-only Markdown row.
  let currentContext: Binding | null = { ...context, message: "```\nprompt: Test UI.\n```" };
  const cleanup = install(
    {
      inspect: async () => snapshot,
      send: async (_scope, key) => {
        assert.equal(key, "key");
        sends++;
        return snapshot;
      },
    },
    document as unknown as Parameters<typeof install>[1],
    () => currentContext,
  );
  try {
    await pause();
    assert.equal(document.querySelectorAll(".npa-send").length, 1);
    assert.equal(document.querySelectorAll('[role="switch"]').length, 0);
    const send = document.querySelector(".npa-send")!;
    send.dispatchEvent(new window.Event("click"));
    send.dispatchEvent(new window.Event("click"));
    await pause();
    assert.equal(sends, 1);
    assert.equal(document.querySelector("textarea")!.textContent, "unsent draft");
    assert.equal(
      document.querySelector('[data-paseo-markdown-tag="code"]')!.textContent,
      "prompt: Test UI.",
    );
    assert.ok(document.querySelector("#copy"));
    currentContext = { ...context, agentId: "other" };
    document.querySelector(".npa-send")!.dispatchEvent(new window.Event("click"));
    assert.equal(sends, 1);
  } finally {
    cleanup();
    assert.equal(document.querySelectorAll("[data-next-prompt-actions]").length, 0);
    assert.equal(document.querySelectorAll("[data-npa-block]").length, 0);
    if (previous) Object.defineProperty(globalThis, "MutationObserver", previous);
    else Reflect.deleteProperty(globalThis, "MutationObserver");
  }
});
test("Edit puts the prompt in the composer, replacing the draft, without sending", async () => {
  // Another conversation stays mounted with its own composer; the host marks the real field
  // with dataSet={{composerInput:""}}.
  const { document, window } = parseHTML(
    '<html><head></head><body><div id="other"><textarea data-composer-input="">other conversation</textarea></div><div id="mine"><div data-testid="assistant-message"><div data-paseo-markdown-tag="pre"><span data-paseo-markdown-tag="code">prompt: Test UI.</span></div></div><div data-testid="message-input-root"><textarea data-composer-input="">half-written draft</textarea></div></div></body></html>',
  );
  const previous = Object.getOwnPropertyDescriptor(globalThis, "MutationObserver");
  Object.defineProperty(globalThis, "MutationObserver", {
    value: window.MutationObserver,
    configurable: true,
  });
  let sends = 0;
  let inputEvents = 0;
  const other = document.querySelector("#other textarea")!;
  const field = document.querySelector("#mine textarea")!;
  field.addEventListener("input", () => inputEvents++);
  const cleanup = install(
    {
      inspect: async () => snapshot,
      send: async () => {
        sends++;
        return snapshot;
      },
    },
    document as unknown as Parameters<typeof install>[1],
    () => context,
  );
  try {
    await pause();
    const edit = document.querySelector(".npa-edit")!;
    assert.equal(edit.textContent, "Edit ↓");
    edit.dispatchEvent(new window.Event("click"));
    assert.equal(field.value, "Test UI.");
    assert.equal(other.value, "other conversation", "another conversation must stay untouched");
    assert.equal(inputEvents, 1, "React needs the input event to adopt the value");
    assert.equal(sends, 0);
    assert.equal(document.querySelector(".npa-note")!.textContent, "Ready in the composer.");
  } finally {
    cleanup();
    if (previous) Object.defineProperty(globalThis, "MutationObserver", previous);
    else Reflect.deleteProperty(globalThis, "MutationObserver");
  }
});
test("React identity fails closed on streaming or missing scope", () => {
  const props = { message: context.message, timestamp: 100, phase: "complete" };
  const node = {
    __reactFiber$test: {
      memoizedProps: {},
      return: { memoizedProps: props, return: { memoizedProps: context } },
    },
  };
  assert.deepEqual(binding(node as unknown as Node), context);
  props.phase = "streaming";
  assert.equal(binding(node as unknown as Node), null);
  assert.equal(binding({} as Node), null);
});

test("a new turn's unsent block renders no note from the previous send", async () => {
  const scope = { serverId: "h", workspaceId: "w", agentId: "a" };
  const next = "## Next Steps\n```\nprompt: Report the next results.\n```";
  const current: Current = {
    epoch: "one",
    busy: false,
    complete: true,
    rows: [
      { type: "user_message", text: "Report test results.", id: "0", timestamp: 1 },
      {
        type: "assistant_message",
        text: "## Next Steps\n```\nprompt: Report results.\n```",
        id: "1",
        timestamp: 2,
      },
    ],
  };
  let engine!: Engine;
  const driver = {
    async read() {
      return structuredClone(current);
    },
    // The daemon starts the turn before acknowledging the send.
    async send() {
      engine.started(scope.agentId);
    },
  };
  engine = new Engine(new Store(), driver, async () => true);
  const key = (await engine.inspect(scope)).candidates[0].key;
  await engine.send(scope, key);
  current.rows.push(
    { type: "user_message", text: "Report results.", id: "2", timestamp: 3 },
    { type: "assistant_message", text: next, id: "3", timestamp: 4 },
  );

  const { document, window } = parseHTML(
    '<html><head></head><body><div data-testid="assistant-message"><div data-paseo-markdown-tag="pre"><span data-paseo-markdown-tag="code">prompt: Report the next results.</span></div></div></body></html>',
  );
  const previous = Object.getOwnPropertyDescriptor(globalThis, "MutationObserver");
  Object.defineProperty(globalThis, "MutationObserver", {
    value: window.MutationObserver,
    configurable: true,
  });
  const cleanup = install(
    {
      inspect: (input) => engine.inspect(input),
      send: async (input, sendKey) => {
        await engine.send(input, sendKey);
        return engine.inspect(input);
      },
    },
    document as unknown as Parameters<typeof install>[1],
    () => ({ ...scope, message: next, timestamp: 4 }),
  );
  try {
    await pause();
    assert.equal(document.querySelectorAll(".npa-send").length, 1);
    assert.equal(document.querySelector(".npa-send")!.textContent, "Send ↑");
    assert.equal(document.querySelector(".npa-note")!.textContent, "");
  } finally {
    cleanup();
    if (previous) Object.defineProperty(globalThis, "MutationObserver", previous);
    else Reflect.deleteProperty(globalThis, "MutationObserver");
  }
});

test("new completed prompt renders promptly after a previous scan", async () => {
  const { document, window } = parseHTML(
    '<html><head></head><body><div data-testid="assistant-message"></div></body></html>',
  );
  const previous = Object.getOwnPropertyDescriptor(globalThis, "MutationObserver");
  Object.defineProperty(globalThis, "MutationObserver", {
    value: window.MutationObserver,
    configurable: true,
  });
  let completed = false;
  const cleanup = install(
    { inspect: async () => snapshot, send: async () => snapshot },
    document as unknown as Parameters<typeof install>[1],
    () => (completed ? context : null),
  );
  try {
    await pause();
    assert.equal(document.querySelectorAll(".npa-send").length, 0);
    completed = true;
    document.querySelector('[data-testid="assistant-message"]')!.innerHTML =
      '<div data-paseo-markdown-tag="pre"><span data-paseo-markdown-tag="code">prompt: Test UI.</span></div>';
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(
      document.querySelectorAll(".npa-send").length,
      1,
      "new prompts must not wait for the two-second scan cooldown",
    );
  } finally {
    cleanup();
    if (previous) Object.defineProperty(globalThis, "MutationObserver", previous);
    else Reflect.deleteProperty(globalThis, "MutationObserver");
  }
});

test("Send and Edit update controls in place without extra timeline reads", async () => {
  const { document, window } = parseHTML(
    '<html><head></head><body><div data-testid="assistant-message"><div data-paseo-markdown-tag="pre"><span data-paseo-markdown-tag="code">prompt: Test UI.</span></div></div></body></html>',
  );
  const previous = Object.getOwnPropertyDescriptor(globalThis, "MutationObserver");
  Object.defineProperty(globalThis, "MutationObserver", {
    value: window.MutationObserver,
    configurable: true,
  });
  // No composer: linkedom, unlike browsers, mutates the DOM on a textarea value write, and the
  // Edit note alone must be the only change here.
  let reads = 0;
  let current = snapshot;
  const cleanup = install(
    {
      inspect: async () => {
        reads++;
        return current;
      },
      send: async () => {
        current = { ...snapshot, candidates: [{ ...snapshot.candidates[0], state: "sent" }] };
        return current;
      },
    },
    document as unknown as Parameters<typeof install>[1],
    () => context,
  );
  try {
    // linkedom also reports the block's attribute change, which browsers skip when attributes
    // are not observed; let that one extra scan settle first.
    await pause();
    await pause();
    const ui = document.querySelector("[data-next-prompt-actions]");
    const before = reads;
    document.querySelector(".npa-edit")!.dispatchEvent(new window.Event("click"));
    await pause();
    assert.equal(reads, before, "the plugin's own note must not trigger a timeline read");
    const send = document.querySelector(".npa-send")!;
    send.dispatchEvent(new window.Event("click"));
    assert.equal(send.textContent, "Sending...", "Send gives feedback immediately");
    await pause();
    assert.equal(document.querySelector("[data-next-prompt-actions]"), ui, "no rebuild flash");
    assert.equal(send.textContent, "Sent");
    assert.equal(send.disabled, true);
  } finally {
    cleanup();
    if (previous) Object.defineProperty(globalThis, "MutationObserver", previous);
    else Reflect.deleteProperty(globalThis, "MutationObserver");
  }
});

test("streaming DOM changes reuse the last timeline read until a prompt block changes", async () => {
  const { document, window } = parseHTML(
    '<html><head></head><body><div data-testid="assistant-message"><div data-paseo-markdown-tag="pre"><span data-paseo-markdown-tag="code">prompt: Test UI.</span></div></div><div id="stream"></div></body></html>',
  );
  const previous = Object.getOwnPropertyDescriptor(globalThis, "MutationObserver");
  Object.defineProperty(globalThis, "MutationObserver", {
    value: window.MutationObserver,
    configurable: true,
  });
  let reads = 0;
  const cleanup = install(
    {
      inspect: async () => {
        reads++;
        return snapshot;
      },
      send: async () => snapshot,
    },
    document as unknown as Parameters<typeof install>[1],
    () => context,
  );
  try {
    await pause();
    await pause();
    const before = reads;
    const stream = document.querySelector("#stream")!;
    for (let i = 0; i < 5; i++) {
      stream.appendChild(document.createTextNode(`token ${i} `));
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    await pause();
    assert.equal(reads, before, "streaming tokens must not refetch the timeline");
    assert.equal(document.querySelectorAll(".npa-send").length, 1);
    stream.innerHTML =
      '<div data-testid="assistant-message"><div data-paseo-markdown-tag="pre"><span data-paseo-markdown-tag="code">prompt: Next step.</span></div></div>';
    await pause();
    assert.equal(reads, before + 1, "a new prompt block reads the timeline once");
  } finally {
    cleanup();
    if (previous) Object.defineProperty(globalThis, "MutationObserver", previous);
    else Reflect.deleteProperty(globalThis, "MutationObserver");
  }
});
