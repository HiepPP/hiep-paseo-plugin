import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { binding, install, type Node, type Binding } from "../client/web";
import type { Snapshot } from "../shared/contracts";

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
