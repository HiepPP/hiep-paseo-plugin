import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { boardEvent, binding, install, type Node, type Binding } from "../client/web";
import type { Snapshot } from "../shared/contracts";
import { Engine, type Current } from "../server/engine";
import { Store } from "../server/store";
test("v1 radio groups and checkboxes enforce selection, preview exact prompts, send once and clean up", async () => {
  const value = {
    version: 1,
    prompts: [
      { id: "implement", prompt: "Implement the layout.", why: "Apply the design." },
      { id: "review", prompt: "Review only. Do not change code." },
      { id: "risks", prompt: "List remaining risks." },
    ],
    exclusiveGroups: [["implement", "review"]],
    allowedCombinations: [["review", "risks"]],
  };
  const block = JSON.stringify(value);
  const message = "## What Next\n~~~next-prompts\n" + block + "\n~~~";
  const current: Current = {
    epoch: "v1",
    complete: true,
    busy: false,
    rows: [
      { type: "user_message", id: "0", text: "Suggest next steps.", timestamp: 1 },
      { type: "assistant_message", id: "1", text: message, timestamp: 100 },
    ],
  };
  const sent: string[] = [];
  const engine = new Engine(
    new Store(),
    {
      read: async () => structuredClone(current),
      start: async () => {},
      send: async (_scope, text) => {
        sent.push(text);
      },
    },
    async () => false,
    () => ({ board: false, evaluator: false }),
  );
  const { document, window } = parseHTML(
    '<html><head></head><body><textarea data-composer-input="">draft</textarea><div data-testid="assistant-message"><div data-paseo-markdown-tag="pre"><span data-paseo-markdown-tag="code"></span><button id="copy">Copy</button></div></div></body></html>',
  );
  document.querySelector('[data-paseo-markdown-tag="code"]')!.textContent = block;
  const previous = Object.getOwnPropertyDescriptor(globalThis, "MutationObserver");
  Object.defineProperty(globalThis, "MutationObserver", {
    value: window.MutationObserver,
    configurable: true,
  });
  const cleanup = install(
    {
      inspect: (scope) => engine.inspect(scope),
      send: async (scope, key) => ({ sent: await engine.send(scope, key) }),
    },
    document as unknown as Parameters<typeof install>[1],
    () => ({ ...context, message }),
  );
  try {
    await pause();
    assert.match(document.body.textContent!, /Board unavailable/);
    assert.match(document.body.textContent!, /Jev evaluator unavailable/);
    const radios = document.querySelectorAll('input[type="radio"]');
    const checkbox = document.querySelector('input[type="checkbox"]')!;
    assert.equal(radios.length, 2);
    assert.ok(checkbox);
    assert.equal(radios[0].closest("fieldset"), radios[1].closest("fieldset"));
    assert.notEqual(radios[0].closest("fieldset"), checkbox.closest("fieldset"));
    assert.equal(checkbox.closest("fieldset")!.querySelector("legend")!.textContent, "Follow-up");
    const send = document.querySelector(".npa-selection-send")!;
    assert.equal(send.disabled, true, "no implicit selection");
    const select = (node: typeof checkbox) => {
      node.checked = true;
      node.dispatchEvent(new window.Event("change"));
    };
    select(radios[0]);
    assert.equal(checkbox.disabled, true, "undeclared combination is locked");
    assert.equal(
      checkbox.closest(".npa-choice")!.textContent!.includes("Not with selection"),
      true,
    );
    select(checkbox);
    assert.equal(checkbox.checked, false);
    assert.equal(send.textContent, "Send selected (1)");
    select(radios[1]);
    assert.equal(checkbox.disabled, false);
    select(checkbox);
    assert.equal(radios[0].checked, false, "exclusive choice replaced");
    assert.equal(radios[1].checked, true);
    assert.equal(send.disabled, false);
    document.querySelector(".npa-selection-edit")!.dispatchEvent(new window.Event("click"));
    assert.equal(
      document.querySelector("textarea")!.value,
      "1. Review only. Do not change code.\n2. List remaining risks.",
    );
    send.dispatchEvent(new window.Event("click"));
    send.dispatchEvent(new window.Event("click"));
    await pause();
    assert.deepEqual(sent, ["1. Review only. Do not change code.\n2. List remaining risks."]);
    assert.equal(send.disabled, true);
    assert.equal(document.querySelector('[data-paseo-markdown-tag="code"]')!.textContent, block);
    assert.ok(document.querySelector("#copy"));
  } finally {
    cleanup();
    engine.close();
    assert.equal(document.querySelector("[data-next-prompt-actions]"), null);
    assert.equal(document.querySelector("[data-npa-block]"), null);
    if (previous) Object.defineProperty(globalThis, "MutationObserver", previous);
    else Reflect.deleteProperty(globalThis, "MutationObserver");
  }
});

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
      after: 1,
      state: "ready",
    },
  ],
};
const pause = () => new Promise((r) => setTimeout(r, 170));
// Mirrors the CSS: a swapped button shows its alternate face; a button without faces has one label.
const shown = (button: Node) => {
  const swapped =
    button.getAttribute("data-npa-thread") !== null ||
    button.getAttribute("data-npa-here") !== null;
  const face = button.querySelector(`[data-npa-face="${swapped ? "alt" : "main"}"]`);
  return (face ?? button).textContent;
};

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
        return { sent: true };
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
test("Cmd over Send swaps its face to New thread without moving anything; the click does what is shown", async () => {
  const { document, window } = parseHTML(
    '<html><head></head><body><div data-testid="assistant-message"><div data-paseo-markdown-tag="pre"><span data-paseo-markdown-tag="code">prompt: Test UI.</span></div></div></body></html>',
  );
  const previous = Object.getOwnPropertyDescriptor(globalThis, "MutationObserver");
  Object.defineProperty(globalThis, "MutationObserver", {
    value: window.MutationObserver,
    configurable: true,
  });
  const calls: string[] = [];
  const cleanup = install(
    {
      inspect: async () => snapshot,
      send: async (_scope, key) => (calls.push(`send:${key}`), { sent: true }),
      start: async (_scope, key) => (calls.push(`start:${key}`), { started: true }),
    },
    document as unknown as Parameters<typeof install>[1],
    () => ({ ...context, message: "```\nprompt: Test UI.\n```" }),
  );
  const fire = (target: { dispatchEvent(event: object): void }, type: string, init = {}) =>
    target.dispatchEvent(Object.assign(new window.Event(type, { bubbles: true }), init));
  try {
    await pause();
    const send = document.querySelector(".npa-send")!;
    const face = (name: string) => send.querySelector(`[data-npa-face="${name}"]`)!.textContent;
    assert.equal(face("main"), "Send");
    assert.equal(
      face("alt"),
      "New thread",
      "both labels stay in the button, so its width is fixed",
    );
    const label = send.getAttribute("aria-label");
    fire(send, "mouseenter");
    assert.equal(shown(send), "Send");
    fire(document, "keydown", { key: "Meta", metaKey: true });
    assert.equal(shown(send), "New thread");
    assert.equal(send.getAttribute("data-npa-thread"), "true");
    assert.equal(send.getAttribute("aria-label"), "Start in new thread: Test UI.");
    fire(document, "keyup", { key: "Meta", metaKey: false });
    assert.equal(shown(send), "Send");
    assert.equal(send.getAttribute("aria-label"), label);
    fire(send, "mousemove", { metaKey: true });
    assert.equal(shown(send), "New thread");
    fire(send, "mouseleave");
    assert.equal(shown(send), "Send");
    assert.equal(send.getAttribute("data-npa-thread"), null);
    fire(send, "mouseenter", { metaKey: true });
    assert.equal(shown(send), "New thread", "Cmd already held on entry");
    window.dispatchEvent(new window.Event("blur"));
    assert.equal(shown(send), "Send", "window blur drops the swap");
    fire(send, "mousemove", { metaKey: true });
    assert.equal(shown(send), "New thread", "the next move resyncs from the modifier");
    assert.equal(send.style.minWidth, "");
    assert.equal(send.style.marginLeft, "");
    assert.equal(face("main"), "Send", "a swap changes no text");
    fire(send, "click");
    assert.equal(shown(send), "Starting...");
    assert.equal(send.getAttribute("data-npa-thread"), null);
    await pause();
    assert.deepEqual(calls, ["start:key"]);
    assert.equal(shown(send), "Send");
    fire(send, "mouseleave");
    fire(send, "click", { metaKey: true });
    await pause();
    assert.deepEqual(calls, ["start:key", "send:key"], "Cmd-click without a swap sends here");
  } finally {
    cleanup();
    if (previous) Object.defineProperty(globalThis, "MutationObserver", previous);
    else Reflect.deleteProperty(globalThis, "MutationObserver");
  }
});
test("Cmd over Start in new thread swaps its face to Send unless blocked; the click does what is shown", async () => {
  const { document, window } = parseHTML(
    '<html><head></head><body><div data-testid="assistant-message"><div data-paseo-markdown-tag="pre"><span data-paseo-markdown-tag="code">prompt: Test UI.\nthread: new</span></div></div></body></html>',
  );
  const previous = Object.getOwnPropertyDescriptor(globalThis, "MutationObserver");
  Object.defineProperty(globalThis, "MutationObserver", {
    value: window.MutationObserver,
    configurable: true,
  });
  let current: Snapshot = {
    ...snapshot,
    busy: true,
    candidates: [
      {
        ...snapshot.candidates[0],
        block: "prompt: Test UI.\nthread: new",
        source: "```\nprompt: Test UI.\nthread: new\n```",
        thread: "new",
      },
    ],
  };
  const calls: string[] = [];
  const cleanup = install(
    {
      inspect: async () => current,
      send: async (_scope, key) => (calls.push(`send:${key}`), { sent: true }),
      start: async (_scope, key) => (calls.push(`start:${key}`), { started: true }),
    },
    document as unknown as Parameters<typeof install>[1],
    () => ({ ...context, message: "```\nprompt: Test UI.\nthread: new\n```" }),
  );
  const fire = (target: { dispatchEvent(event: object): void }, type: string, init = {}) =>
    target.dispatchEvent(Object.assign(new window.Event(type, { bubbles: true }), init));
  const settle = (busy: boolean) => {
    current = { ...current, busy };
    return new Promise((r) => setTimeout(r, 2700));
  };
  try {
    await pause();
    let start = document.querySelector(".npa-start")!;
    const face = (name: string) => start.querySelector(`[data-npa-face="${name}"]`)!.textContent;
    assert.equal(face("main"), "Start in new thread");
    assert.equal(face("alt"), "Send");
    fire(start, "mouseenter", { metaKey: true });
    assert.equal(shown(start), "Start in new thread", "a busy conversation cannot send here");
    assert.equal(start.getAttribute("data-npa-here"), null);
    fire(start, "click", { metaKey: true });
    await pause();
    assert.deepEqual(calls, ["start:key"], "Cmd-click without a swap starts the thread");
    fire(start, "mouseleave");
    await settle(false);
    start = document.querySelector(".npa-start")!;
    fire(start, "mouseenter");
    fire(document, "keydown", { key: "Meta", metaKey: true });
    assert.equal(shown(start), "Send");
    assert.equal(start.getAttribute("data-npa-here"), "true");
    assert.equal(face("main"), "Start in new thread", "a swap changes no text");
    assert.equal(start.style.minWidth, "");
    assert.equal(start.style.marginLeft, "");
    fire(document, "keyup", { key: "Meta", metaKey: false });
    assert.equal(shown(start), "Start in new thread");
    fire(document, "keydown", { key: "Meta", metaKey: true });
    assert.equal(shown(start), "Send");
    await settle(true);
    assert.equal(shown(start), "Start in new thread", "the swap drops once sending is blocked");
    fire(document, "keydown", { key: "Meta", metaKey: true });
    assert.equal(start.getAttribute("data-npa-here"), null);
    await settle(false);
    fire(start, "mousemove", { metaKey: true });
    assert.equal(shown(start), "Send");
    fire(start, "click");
    assert.equal(shown(start), "Sending...");
    await pause();
    assert.deepEqual(calls, ["start:key", "send:key"]);
  } finally {
    cleanup();
    if (previous) Object.defineProperty(globalThis, "MutationObserver", previous);
    else Reflect.deleteProperty(globalThis, "MutationObserver");
  }
});
test("an unrelated Git action swaps only between Start and a plain Send", async () => {
  const text = "Review the janitor changes. If tests pass, commit and push.";
  const block = `prompt: ${text}\nthread: new`;
  const current: Snapshot = {
    ...snapshot,
    candidates: [{ ...snapshot.candidates[0], block, text, source: block, thread: "new" }],
  };
  const { document, window } = parseHTML(
    `<html><head></head><body><div data-testid="assistant-message"><div data-paseo-markdown-tag="pre"><span data-paseo-markdown-tag="code">${block}</span></div></div></body></html>`,
  );
  const previous = Object.getOwnPropertyDescriptor(globalThis, "MutationObserver");
  Object.defineProperty(globalThis, "MutationObserver", {
    value: window.MutationObserver,
    configurable: true,
  });
  const calls: string[] = [];
  const cleanup = install(
    {
      inspect: async () => current,
      send: async (_scope, key) => (calls.push(`send:${key}`), { sent: true }),
      start: async (_scope, key) => (calls.push(`start:${key}`), { started: true }),
    },
    document as unknown as Parameters<typeof install>[1],
    () => ({ ...context, message: block }),
  );
  const fire = (target: { dispatchEvent(event: object): void }, type: string, init = {}) =>
    target.dispatchEvent(Object.assign(new window.Event(type, { bubbles: true }), init));
  try {
    await pause();
    const start = document.querySelector(".npa-start")!;
    fire(start, "mouseenter");
    fire(document, "keydown", { key: "Meta", metaKey: true });
    assert.equal(shown(start), "Send");
    assert.equal(start.getAttribute("aria-label"), `Send suggested prompt: ${text}`);
    fire(document, "keyup", { key: "Meta", metaKey: false });
    assert.equal(shown(start), "Start in new thread");
    fire(start, "click");
    await pause();
    assert.deepEqual(calls, ["start:key"]);
  } finally {
    cleanup();
    if (previous) Object.defineProperty(globalThis, "MutationObserver", previous);
    else Reflect.deleteProperty(globalThis, "MutationObserver");
  }
});
test("a Git action beside a swappable Send neither swaps nor breaks the swap", async () => {
  const block = "prompt: Commit the fix.\nprompt: Test UI.";
  const current: Snapshot = {
    ...snapshot,
    candidates: ["Commit the fix.", "Test UI."].map((text, i) => ({
      ...snapshot.candidates[0],
      key: `key${i}`,
      block,
      text,
    })),
  };
  const { document, window } = parseHTML(
    `<html><head></head><body><div data-testid="assistant-message"><div data-paseo-markdown-tag="pre"><span data-paseo-markdown-tag="code">${block}</span></div></div></body></html>`,
  );
  const previous = Object.getOwnPropertyDescriptor(globalThis, "MutationObserver");
  Object.defineProperty(globalThis, "MutationObserver", {
    value: window.MutationObserver,
    configurable: true,
  });
  const calls: string[] = [];
  const cleanup = install(
    {
      inspect: async () => current,
      send: async (_scope, key) => (calls.push(`send:${key}`), { sent: true }),
      start: async (_scope, key) => (calls.push(`start:${key}`), { started: true }),
    },
    document as unknown as Parameters<typeof install>[1],
    () => context,
  );
  const fire = (target: { dispatchEvent(event: object): void }, type: string, init = {}) =>
    target.dispatchEvent(Object.assign(new window.Event(type, { bubbles: true }), init));
  try {
    await pause();
    const [commit, plain] = Array.from<Node>(document.querySelectorAll(".npa-send"));
    assert.equal(commit.querySelector("[data-npa-face]"), null, "a Git action has one label");
    fire(commit, "mouseenter", { metaKey: true });
    assert.equal(shown(commit), "Commit");
    fire(commit, "mouseleave");
    fire(plain, "mouseenter", { metaKey: true });
    assert.equal(shown(plain), "New thread");
    fire(plain, "click");
    await pause();
    assert.deepEqual(calls, ["start:key1"]);
  } finally {
    cleanup();
    if (previous) Object.defineProperty(globalThis, "MutationObserver", previous);
    else Reflect.deleteProperty(globalThis, "MutationObserver");
  }
});
test("legacy prompts render individual controls without bulk actions and hide the raw fence", async () => {
  const block = "prompt: First.\nprompt: Second.";
  const many: Snapshot = {
    ...snapshot,
    candidates: ["First.", "Second."].map((text, i) => ({
      ...snapshot.candidates[0],
      key: `key${i}`,
      block,
      text,
      why: i ? undefined : "Pick **this** now.",
    })),
  };
  const { document, window } = parseHTML(
    `<html><head></head><body><div data-testid="assistant-message"><div data-paseo-markdown-tag="pre"><span data-paseo-markdown-tag="code">${block}</span></div></div></body></html>`,
  );
  const previous = Object.getOwnPropertyDescriptor(globalThis, "MutationObserver");
  Object.defineProperty(globalThis, "MutationObserver", {
    value: window.MutationObserver,
    configurable: true,
  });
  const sent: (string | string[])[] = [];
  const cleanup = install(
    {
      inspect: async () => many,
      send: async (_scope, key) => {
        sent.push(key);
        return { sent: true };
      },
    },
    document as unknown as Parameters<typeof install>[1],
    () => context,
  );
  try {
    await pause();
    const labels = document.querySelectorAll(".npa-row .npa-label");
    assert.deepEqual(
      Array.from(labels, (label: Node) => label.textContent),
      ["First.Pick this now.", "Second."],
    );
    assert.equal(document.querySelectorAll(".npa-why").length, 1);
    assert.equal(document.querySelector(".npa-why strong")!.textContent, "this");
    assert.equal(document.querySelectorAll(".npa-row .npa-edit").length, 2);
    assert.equal(document.querySelector(".npa-all"), null);
    const pre = document.querySelector('[data-paseo-markdown-tag="pre"]')!;
    assert.equal(pre.getAttribute("data-npa-block"), "multiple");
    assert.match(
      document.querySelector("style")!.textContent!,
      /\[data-npa-block\] > :not\(\[data-next-prompt-actions\]\) \{display:none!important;\}/,
    );
    document.querySelectorAll(".npa-send")[1].dispatchEvent(new window.Event("click"));
    await pause();
    assert.deepEqual(sent, ["key1"]);
  } finally {
    cleanup();
    if (previous) Object.defineProperty(globalThis, "MutationObserver", previous);
    else Reflect.deleteProperty(globalThis, "MutationObserver");
  }
});
test("sending hook runs on click, before the acknowledgement, with its outcome", async () => {
  const { document, window } = parseHTML(
    '<html><head></head><body><div data-testid="assistant-message"><div data-paseo-markdown-tag="pre"><span data-paseo-markdown-tag="code">prompt: Test UI.</span></div></div></body></html>',
  );
  const previous = Object.getOwnPropertyDescriptor(globalThis, "MutationObserver");
  Object.defineProperty(globalThis, "MutationObserver", {
    value: window.MutationObserver,
    configurable: true,
  });
  let acknowledge!: (value: { sent: boolean }) => void;
  const outcomes: Promise<boolean>[] = [];
  const cleanup = install(
    {
      inspect: async () => snapshot,
      send: () => new Promise((resolve) => (acknowledge = resolve)),
      sending: (outcome) => outcomes.push(outcome),
    },
    document as unknown as Parameters<typeof install>[1],
    () => context,
  );
  try {
    await pause();
    document.querySelector(".npa-send")!.dispatchEvent(new window.Event("click"));
    assert.equal(outcomes.length, 1);
    acknowledge({ sent: false });
    assert.equal(await outcomes[0], false);
  } finally {
    cleanup();
    if (previous) Object.defineProperty(globalThis, "MutationObserver", previous);
    else Reflect.deleteProperty(globalThis, "MutationObserver");
  }
});
test("Commit replaces Send and immediately sends the skill once without changing drafts", async () => {
  const block = "prompt: Run tests.\nwhy: Before commit.\nprompt: Commit the fix. Do not push.";
  const message = `## Next Steps\n\`\`\`\n${block}\n\`\`\``;
  let currentContext: Binding = { ...context, message };
  const current: Current = {
    epoch: "one",
    busy: false,
    complete: true,
    rows: [
      { type: "user_message", text: "Fix the issue.", id: "0", timestamp: 1 },
      { type: "assistant_message", text: message, id: "1", timestamp: 100 },
    ],
  };
  const sent: string[] = [];
  let acknowledge!: () => void;
  const outcomes: Promise<boolean>[] = [];
  const engine = new Engine(
    new Store(),
    {
      read: async () => structuredClone(current),
      start: async () => {},
      async send(scope, text) {
        assert.equal(scope.agentId, context.agentId);
        sent.push(text);
        await new Promise<void>((resolve) => {
          acknowledge = resolve;
        });
      },
    },
    async () => false,
  );
  const { document, window } = parseHTML(
    `<html><head></head><body><textarea data-composer-input="">unsent draft</textarea><div data-testid="assistant-message"><div data-paseo-markdown-tag="pre"><span data-paseo-markdown-tag="code">${block}</span></div></div></body></html>`,
  );
  const previous = Object.getOwnPropertyDescriptor(globalThis, "MutationObserver");
  Object.defineProperty(globalThis, "MutationObserver", {
    value: window.MutationObserver,
    configurable: true,
  });
  const cleanup = install(
    {
      inspect: (scope) => engine.inspect(scope),
      send: async (scope, key) => ({ sent: await engine.send(scope, key) }),
      sending: (outcome) => outcomes.push(outcome),
    },
    document as unknown as Parameters<typeof install>[1],
    () => currentContext,
  );
  try {
    await pause();
    const commit = document.querySelector(".npa-commit")!;
    assert.equal(document.querySelectorAll(".npa-commit").length, 1);
    assert.equal(commit.closest(".npa-row")!.querySelectorAll("button").length, 2);
    assert.equal(commit.textContent, "Commit");
    assert.equal(
      commit.closest(".npa-row")!.querySelector(".npa-label")!.textContent,
      "Commit the fix. Do not push.",
    );
    assert.equal(document.querySelector(".npa-all .npa-commit"), null);
    assert.equal(document.querySelector(".npa-all"), null, "Git actions cannot be batch-sent");
    assert.equal(commit.disabled, false);
    currentContext = { ...currentContext, agentId: "other" };
    commit.dispatchEvent(new window.Event("click"));
    assert.equal(outcomes.length, 0);
    currentContext = { ...context, message };
    commit.dispatchEvent(new window.Event("click"));
    commit.dispatchEvent(new window.Event("click"));
    document.querySelectorAll(".npa-send")[1].dispatchEvent(new window.Event("click"));
    assert.equal(outcomes.length, 1, "Board navigation starts before the send acknowledgement");
    assert.equal(commit.disabled, true);
    await pause();
    assert.deepEqual(sent, [
      "/commit --no-push\nCommit the fix. Do not push.\nCommit only the described changes. Preserve unrelated work.",
    ]);
    assert.equal(document.querySelector("textarea")!.value, "unsent draft");
    acknowledge();
    assert.equal(await outcomes[0], true);
    await pause();
    assert.equal(commit.disabled, true);
    assert.equal(document.querySelectorAll(".npa-send")[1].textContent, "Sent");
    commit.dispatchEvent(new window.Event("click"));
    assert.equal(sent.length, 1);
  } finally {
    cleanup();
    engine.close();
    if (previous) Object.defineProperty(globalThis, "MutationObserver", previous);
    else Reflect.deleteProperty(globalThis, "MutationObserver");
  }
});
test("Git cards show one matching primary action while mentions keep Send", async () => {
  const prompts = [
    "Commit the fix.",
    "Commit and push the fix.",
    "Push the existing commit.",
    "Review commit abc123.",
    "Không commit hoặc push.",
  ];
  const block = prompts.map((text) => `prompt: ${text}`).join("\n");
  const current: Snapshot = {
    ...snapshot,
    candidates: prompts.map((text, i) => ({
      ...snapshot.candidates[0],
      key: `key${i}`,
      block,
      text,
    })),
  };
  const { document, window } = parseHTML(
    `<html><head></head><body><div data-testid="assistant-message"><div data-paseo-markdown-tag="pre"><span data-paseo-markdown-tag="code">${block}</span></div></div></body></html>`,
  );
  const previous = Object.getOwnPropertyDescriptor(globalThis, "MutationObserver");
  Object.defineProperty(globalThis, "MutationObserver", {
    value: window.MutationObserver,
    configurable: true,
  });
  const sent: (string | string[])[] = [];
  const cleanup = install(
    {
      inspect: async () => current,
      send: async (_scope, key) => {
        sent.push(key);
        return { sent: true };
      },
    },
    document as unknown as Parameters<typeof install>[1],
    () => context,
  );
  try {
    await pause();
    const rows = document.querySelectorAll(".npa-row");
    assert.equal(rows.length, prompts.length);
    assert.deepEqual(
      Array.from(rows, (row: Node) =>
        Array.from(row.querySelectorAll("button"), (button: Node) => button.textContent),
      ),
      [
        ["Edit", "Commit"],
        ["Edit", "Commit & Push"],
        ["Edit", "Push"],
        ["Edit", "Send"],
        ["Edit", "Send"],
      ],
    );
    assert.equal(document.querySelectorAll(".npa-send.npa-commit").length, 2);
    assert.equal(document.querySelectorAll(".npa-send.npa-push").length, 1);
    assert.equal(document.querySelector(".npa-all"), null);
    // Cmd has no alternate for a Git action, so a Cmd-click still runs the primary action.
    const commitPush = rows[1].querySelector(".npa-send")!;
    commitPush.dispatchEvent(
      Object.assign(new window.Event("mouseenter", { bubbles: true }), { metaKey: true }),
    );
    assert.equal(commitPush.getAttribute("data-npa-thread"), null);
    assert.equal(commitPush.querySelector("[data-npa-face]"), null);
    commitPush.dispatchEvent(
      Object.assign(new window.Event("click", { bubbles: true }), { metaKey: true }),
    );
    await pause();
    rows[2].querySelector(".npa-send")!.dispatchEvent(new window.Event("click"));
    await pause();
    assert.deepEqual(sent, ["key1", "key2"]);
  } finally {
    cleanup();
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
        return { sent: true };
      },
    },
    document as unknown as Parameters<typeof install>[1],
    () => context,
  );
  try {
    await pause();
    const edit = document.querySelector(".npa-edit")!;
    assert.equal(edit.textContent, "Edit");
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
    async start() {},
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
        return { sent: await engine.send(input, sendKey) };
      },
    },
    document as unknown as Parameters<typeof install>[1],
    () => ({ ...scope, message: next, timestamp: 4 }),
  );
  try {
    await pause();
    assert.equal(document.querySelectorAll(".npa-send").length, 1);
    assert.equal(document.querySelector(".npa-send")!.textContent, "Send");
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
    { inspect: async () => snapshot, send: async () => ({ sent: true }) },
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
        return { sent: true };
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
      send: async () => ({ sent: true }),
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

test("one structured suggestion uses direct Edit and Send without a selection step", async () => {
  const block = JSON.stringify({
    version: 1,
    prompts: [{ id: "verify", prompt: "Verify the layout." }],
    exclusiveGroups: [],
    allowedCombinations: [],
  });
  const message = `## What Next\n\`\`\`next-prompts\n${block}\n\`\`\``;
  const candidate = {
    ...snapshot.candidates[0],
    block,
    source: message,
    text: "Verify the layout.",
    selection: { blockKey: "single", id: "verify", exclusiveGroups: [], allowedCombinations: [] },
  };
  const { document, window } = parseHTML(
    '<html><head></head><body><textarea data-composer-input="">draft</textarea><div data-testid="assistant-message"><div data-paseo-markdown-tag="h2">What Next</div><div data-paseo-markdown-tag="pre"><span data-paseo-markdown-tag="code"></span></div></div></body></html>',
  );
  document.querySelector('[data-paseo-markdown-tag="code"]')!.textContent = block;
  const previous = Object.getOwnPropertyDescriptor(globalThis, "MutationObserver");
  Object.defineProperty(globalThis, "MutationObserver", {
    value: window.MutationObserver,
    configurable: true,
  });
  const sent: (string | string[])[] = [];
  const cleanup = install(
    {
      inspect: async () => ({ ...snapshot, candidates: [candidate] }),
      send: async (_, key) => {
        sent.push(key);
        return { sent: true };
      },
    },
    document as unknown as Parameters<typeof install>[1],
    () => ({ ...context, message }),
  );
  try {
    await pause();
    assert.equal(document.querySelectorAll("input").length, 0);
    assert.equal(document.querySelectorAll(".npa-edit").length, 1);
    assert.equal(document.querySelectorAll(".npa-send").length, 1);
    document.querySelector(".npa-edit")!.dispatchEvent(new window.Event("click"));
    assert.equal(document.querySelector("textarea")!.value, candidate.text);
    document.querySelector(".npa-send")!.dispatchEvent(new window.Event("click"));
    await pause();
    assert.deepEqual(sent, [candidate.key]);
    assert.ok(document.querySelector("[data-npa-next-heading]"));
  } finally {
    cleanup();
    assert.equal(document.querySelector("[data-npa-next-heading]"), null);
    if (previous) Object.defineProperty(globalThis, "MutationObserver", previous);
    else Reflect.deleteProperty(globalThis, "MutationObserver");
  }
});

test("a folded selection panel keeps the user's choice across later scans", async () => {
  const block = JSON.stringify({
    version: 1,
    prompts: [
      { id: "implement", prompt: "Implement the layout." },
      { id: "review", prompt: "Review only." },
    ],
    exclusiveGroups: [["implement", "review"]],
    allowedCombinations: [],
  });
  const message = `## What Next\nPick one.\n\`\`\`next-prompts\n${block}\n\`\`\``;
  const selection = {
    blockKey: "keep",
    exclusiveGroups: [["implement", "review"]],
    allowedCombinations: [],
  };
  const candidates = ["implement", "review"].map((id, index) => ({
    ...snapshot.candidates[0],
    key: id,
    block,
    source: message,
    text: index ? "Review only." : "Implement the layout.",
    selection: { ...selection, id },
  }));
  const { document, window } = parseHTML(
    '<html><head></head><body><div id="other"></div><div data-testid="assistant-message"><div data-paseo-markdown-tag="h2">What Next</div><div data-paseo-markdown-tag="p">Pick one.</div><div data-paseo-markdown-tag="pre"><span data-paseo-markdown-tag="code"></span></div></div></body></html>',
  );
  document.querySelector('[data-paseo-markdown-tag="code"]')!.textContent = block;
  const previous = Object.getOwnPropertyDescriptor(globalThis, "MutationObserver");
  Object.defineProperty(globalThis, "MutationObserver", {
    value: window.MutationObserver,
    configurable: true,
  });
  const cleanup = install(
    {
      inspect: async () => ({ ...snapshot, candidates }),
      send: async () => ({ sent: true }),
    },
    document as unknown as Parameters<typeof install>[1],
    () => ({ ...context, message }),
  );
  try {
    await pause();
    const panel = document.querySelector("[data-next-prompt-actions]")!;
    const radio = document.querySelectorAll('input[type="radio"]')[1];
    radio.checked = true;
    radio.dispatchEvent(new window.Event("change"));
    // Any host DOM change schedules another scan.
    document.querySelector("#other")!.textContent = "streaming";
    await pause();
    assert.equal(document.querySelector("[data-next-prompt-actions]"), panel, "panel not rebuilt");
    assert.equal(document.querySelectorAll('input[type="radio"]')[1].checked, true);
    assert.equal(document.querySelector(".npa-selection-send")!.textContent, "Send selected (1)");
  } finally {
    cleanup();
    if (previous) Object.defineProperty(globalThis, "MutationObserver", previous);
    else Reflect.deleteProperty(globalThis, "MutationObserver");
  }
});

test("Recap, What Next, and intro fold into one prompt panel and restore exactly", async () => {
  const block = JSON.stringify({
    version: 1,
    prompts: [{ id: "verify", prompt: "Verify the layout." }],
    exclusiveGroups: [],
    allowedCombinations: [],
  });
  const message = `## Recap\n- Branch: \`main\`\n- Did: Read the [report](/report).\n- Commit/push: none\n\n## What Next\nCheck the panel.\n\`\`\`next-prompts\n${block}\n\`\`\``;
  const item = (value: string) =>
    `<div data-paseo-markdown-tag="li"><span data-paseo-markdown-ignore="true" data-paseo-markdown-list-marker="true">•</span><div><span>${value}</span></div></div>`;
  const candidate = {
    ...snapshot.candidates[0],
    block,
    source: message,
    text: "Verify the layout.",
    selection: { blockKey: "panel", id: "verify", exclusiveGroups: [], allowedCombinations: [] },
  };
  const { document, window } = parseHTML(
    `<html><head></head><body><textarea data-composer-input="">draft</textarea><div data-testid="assistant-message"><div data-paseo-markdown-tag="h2"><span>Recap</span></div><div data-paseo-markdown-tag="ul">${item('Branch: <span data-paseo-markdown-tag="code">main</span>')}${item('Did: Read the <a href="/report">report</a>.')}${item("Commit/push: none")}</div><div data-paseo-markdown-tag="h2"><span>What Next</span></div><div data-paseo-markdown-tag="p"><span>Check the panel.</span></div><div data-paseo-markdown-tag="pre"><span data-paseo-markdown-tag="code"></span></div></div></body></html>`,
  );
  document.querySelector(
    '[data-paseo-markdown-tag="pre"] [data-paseo-markdown-tag="code"]',
  )!.textContent = block;
  const assistant = document.querySelector('[data-testid="assistant-message"]')!;
  const before = assistant.innerHTML;
  const previous = Object.getOwnPropertyDescriptor(globalThis, "MutationObserver");
  Object.defineProperty(globalThis, "MutationObserver", {
    value: window.MutationObserver,
    configurable: true,
  });
  const sent: (string | string[])[] = [];
  const cleanup = install(
    {
      inspect: async () => ({ ...snapshot, candidates: [candidate] }),
      send: async (_, key) => {
        sent.push(key);
        return { sent: true };
      },
    },
    document as unknown as Parameters<typeof install>[1],
    () => ({ ...context, message }),
  );
  try {
    await pause();
    const panel = document.querySelector("[data-next-prompt-actions]")!;
    const recap = panel.querySelector(".npa-recap")!;
    assert.equal(recap.querySelector(".npa-kicker")!.textContent, "Recap");
    assert.equal(recap.querySelector(".npa-branch")!.textContent!.trim(), "main");
    const commit = recap.querySelector(".npa-commit")!;
    assert.equal(commit.textContent!.trim(), "No commit");
    assert.equal(commit.getAttribute("aria-label"), "Commit/push: none");
    assert.equal(recap.querySelector(".npa-did")!.textContent!.trim(), "Read the report.");
    assert.equal(
      recap.nextElementSibling!.querySelector(".npa-next-title")!.textContent,
      "What Next",
    );
    assert.equal(panel.querySelector("a")!.getAttribute("href"), "/report");
    assert.equal(panel.querySelector(".npa-next-title")!.textContent, "What Next");
    assert.equal(panel.querySelector(".npa-next-intro")!.textContent!.trim(), "Check the panel.");
    assert.equal(panel.querySelectorAll("[data-paseo-markdown-tag]").length, 0);
    assert.equal(document.querySelectorAll("[data-npa-folded]").length, 4);
    document.querySelector(".npa-send")!.dispatchEvent(new window.Event("click"));
    await pause();
    assert.deepEqual(sent, [candidate.key]);
  } finally {
    cleanup();
    assert.equal(assistant.innerHTML, before);
    if (previous) Object.defineProperty(globalThis, "MutationObserver", previous);
    else Reflect.deleteProperty(globalThis, "MutationObserver");
  }
});

test("goal done shows Task done, and unrelated work starts only in a new thread", async () => {
  const block = JSON.stringify({
    version: 1,
    goal: "done",
    prompts: [
      { id: "ship", prompt: "Commit and push the fix." },
      { id: "audit", prompt: "Audit the logs.", why: "Separate issue.", thread: "new" },
    ],
  });
  const message = `## Recap\n- Branch: \`main\`\n- Did: Fixed it.\n- Commit/push: none\n\n## What Next\n\`\`\`next-prompts\n${block}\n\`\`\``;
  const item = (value: string) =>
    `<div data-paseo-markdown-tag="li"><span data-paseo-markdown-ignore="true" data-paseo-markdown-list-marker="true">•</span><div><span>${value}</span></div></div>`;
  const current: Current = {
    epoch: "goal",
    complete: true,
    busy: false,
    rows: [
      { type: "user_message", id: "0", text: "Fix it.", timestamp: 1 },
      { type: "assistant_message", id: "1", text: message, timestamp: 100 },
    ],
  };
  const sent: string[] = [];
  const started: string[] = [];
  const engine = new Engine(
    new Store(),
    {
      read: async () => structuredClone(current),
      send: async (_scope, text) => {
        sent.push(text);
      },
      start: async (_scope, text) => {
        started.push(text);
      },
    },
    async () => false,
  );
  const { document, window } = parseHTML(
    `<html><head></head><body><textarea data-composer-input="">draft</textarea><div data-testid="assistant-message"><div data-paseo-markdown-tag="h2"><span>Recap</span></div><div data-paseo-markdown-tag="ul">${item('Branch: <span data-paseo-markdown-tag="code">main</span>')}${item("Did: Fixed it.")}${item("Commit/push: none")}</div><div data-paseo-markdown-tag="h2"><span>What Next</span></div><div data-paseo-markdown-tag="pre"><span data-paseo-markdown-tag="code"></span></div></div></body></html>`,
  );
  document.querySelector(
    '[data-paseo-markdown-tag="pre"] [data-paseo-markdown-tag="code"]',
  )!.textContent = block;
  const assistant = document.querySelector('[data-testid="assistant-message"]')!;
  const before = assistant.innerHTML;
  const previous = Object.getOwnPropertyDescriptor(globalThis, "MutationObserver");
  Object.defineProperty(globalThis, "MutationObserver", {
    value: window.MutationObserver,
    configurable: true,
  });
  const cleanup = install(
    {
      inspect: (scope) => engine.inspect(scope),
      send: async (scope, key) => ({ sent: await engine.send(scope, key) }),
      start: async (scope, key) => ({ started: await engine.start(scope, key) }),
    },
    document as unknown as Parameters<typeof install>[1],
    () => ({ ...context, message }),
  );
  try {
    await pause();
    const panel = document.querySelector("[data-next-prompt-actions]")!;
    assert.equal(panel.querySelector(".npa-recap .npa-goal")!.textContent, "Task done");
    const other = panel.querySelector(".npa-other")!;
    assert.equal(other.querySelector(".npa-other-title")!.textContent, "Other work");
    assert.match(
      other.querySelector(".npa-label")!.textContent!,
      /^Audit the logs\.Separate issue\.$/,
    );
    assert.equal(other.querySelectorAll(".npa-edit, .npa-send").length, 0);
    assert.equal(panel.querySelectorAll(".npa-send").length, 1, "only the in-task suggestion");
    assert.equal(panel.querySelector(".npa-send")!.textContent, "Commit & Push");
    const gitSend = panel.querySelector(".npa-send")!;
    gitSend.dispatchEvent(
      Object.assign(new window.Event("mouseenter", { bubbles: true }), { metaKey: true }),
    );
    assert.equal(gitSend.getAttribute("data-npa-thread"), null, "a Git action never swaps");
    assert.equal(gitSend.querySelector("[data-npa-face]"), null);
    assert.equal(panel.querySelectorAll("input").length, 0);
    const start = other.querySelector(".npa-start")!;
    assert.equal(shown(start), "Start in new thread");
    start.dispatchEvent(new window.Event("click"));
    await pause();
    assert.deepEqual([sent, started], [[], ["Audit the logs."]]);
    assert.equal(shown(panel.querySelector(".npa-start")!), "Started");
    assert.equal(panel.querySelector(".npa-start")!.disabled, true);
    assert.equal(document.querySelector("textarea")!.value, "draft");
  } finally {
    cleanup();
    assert.equal(assistant.innerHTML, before);
    if (previous) Object.defineProperty(globalThis, "MutationObserver", previous);
    else Reflect.deleteProperty(globalThis, "MutationObserver");
  }
});

test("a reply watched while streaming keeps actions despite its live chunk timestamp", async () => {
  const message = "## Next Steps\n```\nprompt: Test UI.\n```";
  const current: Current = {
    epoch: "live",
    complete: true,
    busy: false,
    rows: [
      { type: "user_message", id: "0", text: "Check it.", timestamp: 50 },
      // The stored row keeps its first chunk time; the live view keeps its last chunk time.
      { type: "assistant_message", id: "1", text: message, timestamp: 100 },
    ],
  };
  const engine = new Engine(
    new Store(),
    { read: async () => structuredClone(current), send: async () => {}, start: async () => {} },
    async () => false,
  );
  for (const [rendered, interactive] of [
    [137, true],
    [40, false],
  ] as const) {
    const { document, window } = parseHTML(
      '<html><head></head><body><div data-testid="assistant-message"><div data-paseo-markdown-tag="h2">Next Steps</div><div data-paseo-markdown-tag="pre"><span data-paseo-markdown-tag="code">prompt: Test UI.</span></div></div></body></html>',
    );
    const previous = Object.getOwnPropertyDescriptor(globalThis, "MutationObserver");
    Object.defineProperty(globalThis, "MutationObserver", {
      value: window.MutationObserver,
      configurable: true,
    });
    const cleanup = install(
      {
        inspect: (scope) => engine.inspect(scope),
        send: async (scope, key) => ({ sent: await engine.send(scope, key) }),
      },
      document as unknown as Parameters<typeof install>[1],
      () => ({ ...context, message, timestamp: rendered }),
    );
    try {
      await pause();
      assert.ok(document.querySelector("[data-next-prompt-actions]"), `panel at ${rendered}`);
      assert.equal(
        document.querySelectorAll(".npa-send").length,
        interactive ? 1 : 0,
        `actions at ${rendered}`,
      );
    } finally {
      cleanup();
      if (previous) Object.defineProperty(globalThis, "MutationObserver", previous);
      else Reflect.deleteProperty(globalThis, "MutationObserver");
    }
  }
});

test("Paseo history rows of one reply fold into the prompt panel and restore exactly", async () => {
  const block = JSON.stringify({
    version: 1,
    prompts: [{ id: "verify", prompt: "Verify the layout." }],
    exclusiveGroups: [],
    allowedCombinations: [],
  });
  const message = `Intro.\n\n## Recap\n- Branch: \`main\`\n- Did: Read it.\n- Commit/push: pushed main\n\n## What Next\nCheck the panel.\n\`\`\`next-prompts\n${block}\n\`\`\``;
  const item = (value: string) =>
    `<div data-paseo-markdown-tag="li"><div data-paseo-markdown-ignore="true" data-paseo-markdown-list-marker="true">•</div><div>${value}</div></div>`;
  const row = (index: number, content: string) =>
    `<div data-history-row-id="m1:block:${index}" data-message-id="m1"><div data-message-text="true" data-testid="assistant-message">${content}</div></div>`;
  const candidate = {
    ...snapshot.candidates[0],
    block,
    source: message,
    text: "Verify the layout.",
    selection: { blockKey: "rows", id: "verify", exclusiveGroups: [], allowedCombinations: [] },
  };
  const { document, window } = parseHTML(
    `<html><head></head><body><div id="list">${row(0, '<div data-paseo-markdown-tag="p"><div>Intro.</div></div>')}${row(1, `<div data-paseo-markdown-tag="h2"><div>Recap</div></div><div data-paseo-markdown-tag="ul">${item('Branch: <span data-paseo-markdown-tag="code">main</span>')}${item("Did: Read it.")}${item("Commit/push: pushed main")}</div>`)}${row(2, '<div data-paseo-markdown-tag="h2"><div>What Next</div></div><div data-paseo-markdown-tag="p"><div>Check the panel.</div></div>')}${row(3, '<div data-paseo-markdown-tag="pre"><div data-paseo-markdown-tag="code"></div></div>')}</div></body></html>`,
  );
  document.querySelector(
    '[data-paseo-markdown-tag="pre"] [data-paseo-markdown-tag="code"]',
  )!.textContent = block;
  const list = document.querySelector("#list")!;
  const before = list.innerHTML;
  const previous = Object.getOwnPropertyDescriptor(globalThis, "MutationObserver");
  Object.defineProperty(globalThis, "MutationObserver", {
    value: window.MutationObserver,
    configurable: true,
  });
  const cleanup = install(
    {
      inspect: async () => ({ ...snapshot, candidates: [candidate] }),
      send: async () => ({ sent: true }),
    },
    document as unknown as Parameters<typeof install>[1],
    () => ({ ...context, message }),
  );
  try {
    await pause();
    const panel = document.querySelector("[data-next-prompt-actions]")!;
    assert.equal(panel.querySelector(".npa-branch")!.textContent!.trim(), "main");
    const commit = panel.querySelector(".npa-commit.npa-ok")!;
    assert.equal(commit.textContent!.trim(), "pushed main");
    assert.equal(commit.getAttribute("aria-label"), "Commit/push: pushed main");
    assert.equal(panel.querySelector(".npa-next-title")!.textContent, "What Next");
    assert.equal(panel.querySelector(".npa-next-intro")!.textContent!.trim(), "Check the panel.");
    const folded = (index: number) =>
      document
        .querySelector(`[data-history-row-id="m1:block:${index}"]`)!
        .getAttribute("data-npa-folded");
    assert.deepEqual([0, 1, 2, 3].map(folded), [null, "true", "true", null]);
  } finally {
    cleanup();
    assert.equal(list.innerHTML, before);
    if (previous) Object.defineProperty(globalThis, "MutationObserver", previous);
    else Reflect.deleteProperty(globalThis, "MutationObserver");
  }
});

test("earlier replies keep a read-only panel without actions after a newer turn", async () => {
  const code = "prompt: Verify the layout.\nwhy: Pick this to **confirm it**, because it changed.";
  const row = (id: string, index: number, content: string) =>
    `<div data-history-row-id="${id}:block:${index}" data-message-id="${id}"><div data-message-text="true" data-testid="assistant-message">${content}</div></div>`;
  const pre = `<div data-paseo-markdown-tag="pre"><div data-paseo-markdown-tag="code">${code}</div></div>`;
  const { document, window } = parseHTML(
    `<html><head></head><body><div id="list">${row("old", 0, '<div data-paseo-markdown-tag="h2"><div>What Next</div></div>')}${row("old", 1, pre)}${row("loose", 0, '<div data-paseo-markdown-tag="h2"><div>Notes</div></div>')}${row("loose", 1, pre)}</div></body></html>`,
  );
  const list = document.querySelector("#list")!;
  const before = list.innerHTML;
  const previous = Object.getOwnPropertyDescriptor(globalThis, "MutationObserver");
  Object.defineProperty(globalThis, "MutationObserver", {
    value: window.MutationObserver,
    configurable: true,
  });
  const cleanup = install(
    { inspect: async () => ({ ...snapshot, candidates: [] }), send: async () => ({ sent: true }) },
    document as unknown as Parameters<typeof install>[1],
    () => ({ ...context, message: "older reply" }),
  );
  try {
    await pause();
    const panels = document.querySelectorAll("[data-next-prompt-actions]");
    assert.equal(panels.length, 1);
    const panel = panels[0];
    assert.ok(panel.closest('[data-message-id="old"]'));
    assert.equal(panel.getAttribute("data-npa-readonly"), "true");
    assert.equal(panel.querySelector(".npa-next-title")!.textContent, "What Next");
    assert.equal(panel.querySelector(".npa-label")!.firstChild!.textContent, "Verify the layout.");
    assert.equal(panel.querySelector(".npa-why strong")!.textContent, "confirm it");
    assert.equal(panel.querySelectorAll("button, input").length, 0);
  } finally {
    cleanup();
    assert.equal(list.innerHTML, before);
    if (previous) Object.defineProperty(globalThis, "MutationObserver", previous);
    else Reflect.deleteProperty(globalThis, "MutationObserver");
  }
});

test("rows mounted by the virtualized history fold before the timeline read returns", async () => {
  const code = "prompt: Continue the review.";
  const row = (index: number, content: string) =>
    `<div data-history-row-id="v:block:${index}" data-message-id="v"><div data-message-text="true" data-testid="assistant-message">${content}</div></div>`;
  const item = (value: string) =>
    `<div data-paseo-markdown-tag="li"><div data-paseo-markdown-ignore="true" data-paseo-markdown-list-marker="true">•</div><div>${value}</div></div>`;
  const { document, window } = parseHTML(
    '<html><head></head><body><div id="list"></div></body></html>',
  );
  const previous = Object.getOwnPropertyDescriptor(globalThis, "MutationObserver");
  Object.defineProperty(globalThis, "MutationObserver", {
    value: window.MutationObserver,
    configurable: true,
  });
  const cleanup = install(
    // The read never settles: only the synchronous mount path can produce the panel.
    { inspect: () => new Promise(() => {}), send: async () => ({ sent: true }) },
    document as unknown as Parameters<typeof install>[1],
    () => ({ ...context, message: "older reply" }),
  );
  try {
    const list = document.querySelector("#list")!;
    list.insertAdjacentHTML(
      "beforeend",
      row(1, '<div data-paseo-markdown-tag="h2"><div>What Next</div></div>') +
        row(
          2,
          `<div data-paseo-markdown-tag="pre"><div data-paseo-markdown-tag="code">${code}</div></div>`,
        ),
    );
    await Promise.resolve();
    await Promise.resolve();
    const panel = list.querySelector("[data-next-prompt-actions]");
    assert.ok(panel, "panel renders in the mutation callback");
    assert.equal(panel!.querySelector(".npa-recap"), null);
    list.insertAdjacentHTML(
      "afterbegin",
      row(
        0,
        `<div data-paseo-markdown-tag="h2"><div>Recap</div></div><div data-paseo-markdown-tag="ul">${item("Branch: main")}${item("Did: Read it.")}${item("Commit/push: none")}</div>`,
      ),
    );
    await Promise.resolve();
    await Promise.resolve();
    assert.ok(list.querySelector("[data-next-prompt-actions] .npa-recap"), "late rows fold in");
    assert.equal(
      list.querySelector('[data-history-row-id="v:block:0"]')!.getAttribute("data-npa-folded"),
      "true",
    );
  } finally {
    cleanup();
    if (previous) Object.defineProperty(globalThis, "MutationObserver", previous);
    else Reflect.deleteProperty(globalThis, "MutationObserver");
  }
});

test("a timeline read that started before rows mounted does not clear their panels", async () => {
  const row = (id: string, index: number, content: string) =>
    `<div data-history-row-id="${id}:block:${index}" data-message-id="${id}"><div data-message-text="true" data-testid="assistant-message">${content}</div></div>`;
  const reply = (id: string) =>
    row(id, 0, '<div data-paseo-markdown-tag="h2"><div>What Next</div></div>') +
    row(
      id,
      1,
      `<div data-paseo-markdown-tag="pre"><div data-paseo-markdown-tag="code">prompt: Continue ${id}.</div></div>`,
    );
  const { document, window } = parseHTML(
    `<html><head></head><body><div id="list">${reply("a")}</div></body></html>`,
  );
  const previous = Object.getOwnPropertyDescriptor(globalThis, "MutationObserver");
  Object.defineProperty(globalThis, "MutationObserver", {
    value: window.MutationObserver,
    configurable: true,
  });
  let settle: (value: Snapshot) => void = () => {};
  const cleanup = install(
    {
      inspect: () => new Promise<Snapshot>((resolve) => (settle = resolve)),
      send: async () => ({ sent: true }),
    },
    document as unknown as Parameters<typeof install>[1],
    () => ({ ...context, message: "older reply" }),
  );
  try {
    await pause(); // the scan now waits on the read
    document.querySelector("#list")!.insertAdjacentHTML("beforeend", reply("b"));
    await Promise.resolve();
    const panelB = () => document.querySelector('[data-message-id="b"] [data-next-prompt-actions]');
    assert.ok(panelB(), "mount path renders b");
    settle({ ...snapshot, candidates: [] });
    await pause();
    assert.ok(panelB(), "the earlier read keeps b's panel");
    assert.equal(document.querySelectorAll("[data-next-prompt-actions]").length, 2);
  } finally {
    cleanup();
    if (previous) Object.defineProperty(globalThis, "MutationObserver", previous);
    else Reflect.deleteProperty(globalThis, "MutationObserver");
  }
});

test("Recap Did with nested bullets keeps them as a list in the panel", async () => {
  const block = JSON.stringify({
    version: 1,
    prompts: [{ id: "verify", prompt: "Verify the layout." }],
    exclusiveGroups: [],
    allowedCombinations: [],
  });
  const message = `## Recap\n- Branch: main\n- Did:\n  - Added config.\n  - Fixed bridge.\n- Commit/push: none\n\n## What Next\n\`\`\`next-prompts\n${block}\n\`\`\``;
  const item = (value: string) =>
    `<div data-paseo-markdown-tag="li"><span data-paseo-markdown-ignore="true" data-paseo-markdown-list-marker="true">•</span><div><span>${value}</span></div></div>`;
  const nested = `<div data-paseo-markdown-tag="ul">${item("Added config.")}${item("Fixed bridge.")}</div>`;
  const candidate = {
    ...snapshot.candidates[0],
    block,
    source: message,
    text: "Verify the layout.",
    selection: { blockKey: "nested", id: "verify", exclusiveGroups: [], allowedCombinations: [] },
  };
  const { document, window } = parseHTML(
    `<html><head></head><body><textarea data-composer-input=""></textarea><div data-testid="assistant-message"><div data-paseo-markdown-tag="h2"><span>Recap</span></div><div data-paseo-markdown-tag="ul">${item("Branch: main")}${item(`Did:${nested}`)}${item("Commit/push: none")}</div><div data-paseo-markdown-tag="h2"><span>What Next</span></div><div data-paseo-markdown-tag="pre"><span data-paseo-markdown-tag="code"></span></div></div></body></html>`,
  );
  document.querySelector(
    '[data-paseo-markdown-tag="pre"] [data-paseo-markdown-tag="code"]',
  )!.textContent = block;
  const assistant = document.querySelector('[data-testid="assistant-message"]')!;
  const before = assistant.innerHTML;
  const previous = Object.getOwnPropertyDescriptor(globalThis, "MutationObserver");
  Object.defineProperty(globalThis, "MutationObserver", {
    value: window.MutationObserver,
    configurable: true,
  });
  const cleanup = install(
    {
      inspect: async () => ({ ...snapshot, candidates: [candidate] }),
      send: async () => ({ sent: true }),
    },
    document as unknown as Parameters<typeof install>[1],
    () => ({ ...context, message }),
  );
  try {
    await pause();
    const did = document.querySelector("[data-next-prompt-actions] .npa-did")!;
    assert.equal(did.tagName, "DIV");
    const bullets = Array.from(did.querySelectorAll('[data-npa-list="li"]'));
    assert.deepEqual(
      bullets.map((bullet) => (bullet as Node).textContent!.replace("•", "").trim()),
      ["Added config.", "Fixed bridge."],
    );
    assert.equal(did.querySelectorAll("[data-paseo-markdown-list-marker]").length, 2);
    assert.equal(document.querySelectorAll("[data-npa-folded]").length, 3);
  } finally {
    cleanup();
    assert.equal(assistant.innerHTML, before);
    if (previous) Object.defineProperty(globalThis, "MutationObserver", previous);
    else Reflect.deleteProperty(globalThis, "MutationObserver");
  }
});

test("Board notifications carry the sending host and never emit legacy events", () => {
  const { document } = parseHTML("<html><body></body></html>");
  const received: string[] = [];
  document.addEventListener("paseo-board:v2:open", (event: Event) =>
    received.push((event as CustomEvent).detail.serverId),
  );
  document.addEventListener("paseo-board:open", () => received.push("legacy"));
  boardEvent("paseo-board:open", "local", document as unknown as Parameters<typeof boardEvent>[2]);
  assert.deepEqual(received, ["local"]);
});

type Page = ReturnType<typeof parseHTML>;
// The client's minimal Node lacks a few DOM members these checks read.
type El = Node & {
  classList: { contains(name: string): boolean };
  firstChild: Node | null;
  children: ArrayLike<Node>;
  tagName: string;
};
const all = (node: Node, selector: string) => Array.from(node.querySelectorAll(selector)) as El[];
// Mounts one assistant reply with a real Engine and runs `check` against the folded panel.
async function withReply(
  reply: { html: string; message: string; code: string; started?: string[] },
  check: (page: {
    document: Page["document"];
    window: Page["window"];
    panel: El;
    sent: string[];
  }) => Promise<void> | void,
) {
  const current: Current = {
    epoch: "badge",
    complete: true,
    busy: false,
    rows: [
      { type: "user_message", id: "0", text: "Continue.", timestamp: 1 },
      { type: "assistant_message", id: "1", text: reply.message, timestamp: 100 },
    ],
  };
  const sent: string[] = [];
  const engine = new Engine(
    new Store(),
    {
      read: async () => structuredClone(current),
      send: async (_scope, text) => {
        sent.push(text);
      },
      start: async (_scope, text) => {
        reply.started?.push(text);
      },
    },
    async () => false,
  );
  const { document, window } = parseHTML(
    `<html><head></head><body><textarea data-composer-input="">draft</textarea><div data-testid="assistant-message">${reply.html}</div></body></html>`,
  );
  document.querySelector(
    '[data-paseo-markdown-tag="pre"] [data-paseo-markdown-tag="code"]',
  )!.textContent = reply.code;
  const assistant = document.querySelector('[data-testid="assistant-message"]')!;
  const before = assistant.innerHTML;
  const previous = Object.getOwnPropertyDescriptor(globalThis, "MutationObserver");
  Object.defineProperty(globalThis, "MutationObserver", {
    value: window.MutationObserver,
    configurable: true,
  });
  const cleanup = install(
    {
      inspect: (scope) => engine.inspect(scope),
      send: async (scope, key) => ({ sent: await engine.send(scope, key) }),
      start: async (scope, key) => ({ started: await engine.start(scope, key) }),
    },
    document as unknown as Parameters<typeof install>[1],
    () => ({ ...context, message: reply.message }),
  );
  try {
    await pause();
    const panel = document.querySelector("[data-next-prompt-actions]") as unknown as El;
    assert.ok(panel, "panel mounted");
    await check({ document, window, panel, sent });
  } finally {
    cleanup();
    engine.close();
    assert.equal(assistant.innerHTML, before);
    if (previous) Object.defineProperty(globalThis, "MutationObserver", previous);
    else Reflect.deleteProperty(globalThis, "MutationObserver");
  }
}
const nextHtml = `<div data-paseo-markdown-tag="h2"><span>What Next</span></div><div data-paseo-markdown-tag="pre"><span data-paseo-markdown-tag="code"></span></div>`;
const suggestedBadges = (node: Node) => all(node, ".npa-suggested");

test("a Suggested badge marks only flagged cards, in direct and Other work rows", async () => {
  const code = [
    "prompt: Verify the layout.",
    "suggestion: true",
    "prompt: Review the spacing.",
    "prompt: Audit the logs.",
    "why: Separate issue.",
    "thread: new",
    "suggestion: true",
    "prompt: Check the docs.",
    "thread: new",
  ].join("\n");
  const started: string[] = [];
  await withReply(
    { html: nextHtml, message: `## What Next\n\`\`\`text\n${code}\n\`\`\``, code, started },
    async ({ document, window, panel, sent }) => {
      const badges = suggestedBadges(panel);
      assert.equal(badges.length, 2);
      const direct = all(panel, ".npa-next > .npa-row");
      const other = all(panel, ".npa-other > .npa-row");
      assert.equal(direct.length, 2);
      assert.equal(other.length, 2);
      assert.equal(direct[0].querySelector(".npa-suggested")?.textContent, "Suggested");
      assert.equal(other[0].querySelector(".npa-suggested")?.textContent, "Suggested");
      // Badge is a direct card child, outside the label, so it never joins prompt text.
      for (const badge of badges)
        assert.equal(badge.parentElement!.getAttribute("class"), "npa-row");
      assert.equal(direct[0].querySelector(".npa-label")!.textContent, "Verify the layout.");
      assert.equal(
        (other[0].querySelector(".npa-label") as El).firstChild!.textContent,
        "Audit the logs.",
      );
      // Unsuggested cards get no extra node.
      assert.equal(direct[1].querySelector(".npa-suggested"), null);
      assert.deepEqual(
        Array.from(direct[1].children).map((child) => child.getAttribute("class")),
        ["npa-label", "npa-actions"],
      );
      assert.deepEqual(
        Array.from(other[1].children).map((child) => child.getAttribute("class")),
        ["npa-label", "npa-actions"],
      );
      // Readable by assistive tech.
      for (const badge of badges) {
        assert.equal(badge.closest("[aria-hidden]"), null);
        assert.equal(badge.getAttribute("hidden"), null);
      }
      // Edit and Send use the prompt text only.
      direct[0].querySelector(".npa-edit")!.dispatchEvent(new window.Event("click"));
      assert.equal(document.querySelector("textarea")!.value, "Verify the layout.");
      direct[0].querySelector(".npa-send")!.dispatchEvent(new window.Event("click"));
      await pause();
      assert.deepEqual(sent, ["Verify the layout."]);
      other[0].querySelector(".npa-start")!.dispatchEvent(new window.Event("click"));
      await pause();
      assert.deepEqual(started, ["Audit the logs."]);
    },
  );
});

test("a suggested Git action keeps its Commit button and Git guards", async () => {
  const code = "prompt: Commit the fix.\nsuggestion: true\nprompt: Verify the fix.";
  await withReply(
    { html: nextHtml, message: `## What Next\n\`\`\`text\n${code}\n\`\`\``, code },
    async ({ window, panel, sent }) => {
      const [first, second] = all(panel, ".npa-row");
      assert.equal(suggestedBadges(panel).length, 1);
      assert.ok(first.querySelector(".npa-suggested"));
      assert.equal(second.querySelector(".npa-suggested"), null);
      assert.equal(shown(first.querySelector(".npa-send")!), "Commit");
      first.querySelector(".npa-send")!.dispatchEvent(new window.Event("click"));
      await pause();
      assert.match(sent[0], /^\/commit --no-push\nCommit the fix\./);
      assert.doesNotMatch(sent[0], /suggest/i);
    },
  );
});

test("a Suggested badge marks flagged selection rows without covering state or text", async () => {
  const block = JSON.stringify({
    version: 1,
    prompts: [
      { id: "implement", prompt: "Implement the layout.", suggestion: true },
      { id: "review", prompt: "Review only.", why: "Pick this to **check it**." },
      { id: "risks", prompt: "List remaining risks.", suggestion: true },
    ],
    exclusiveGroups: [["implement", "review"]],
    allowedCombinations: [["implement", "risks"]],
  });
  await withReply(
    { html: nextHtml, message: `## What Next\n\`\`\`next-prompts\n${block}\n\`\`\``, code: block },
    async ({ document, window, panel, sent }) => {
      const choices = all(panel, ".npa-choice");
      assert.equal(choices.length, 3);
      assert.equal(suggestedBadges(panel).length, 2);
      assert.equal(choices[0].querySelector(".npa-suggested")?.textContent, "Suggested");
      assert.equal(choices[1].querySelector(".npa-suggested"), null);
      assert.equal(choices[2].querySelector(".npa-suggested")?.textContent, "Suggested");
      for (const choice of [choices[0], choices[2]]) {
        const badge = choice.querySelector(".npa-suggested")!;
        assert.equal(badge.parentElement, choice, "a direct row child");
        assert.equal(badge.closest(".npa-label"), null);
        assert.equal(badge.closest(".npa-choice-state"), null);
        assert.equal(badge.closest("[aria-hidden]"), null);
        assert.ok(choice.querySelector(".npa-choice-state"), "state cell is kept");
        // The checkbox or radio name is the prompt, and it is described by the badge.
        const input = choice.querySelector("input")!;
        assert.equal(document.getElementById(input.getAttribute("aria-describedby")!), badge);
      }
      assert.equal(choices[1].querySelector("input")!.getAttribute("aria-describedby"), null);
      assert.equal(
        choices[0].querySelector("input")!.getAttribute("aria-label"),
        "Implement the layout.",
      );
      assert.equal(choices[0].querySelector(".npa-label")!.textContent, "Implement the layout.");
      const radio = choices[0].querySelector("input")!;
      radio.checked = true;
      radio.dispatchEvent(new window.Event("change"));
      const checkbox = choices[2].querySelector("input")!;
      checkbox.checked = true;
      checkbox.dispatchEvent(new window.Event("change"));
      document.querySelector(".npa-selection-edit")!.dispatchEvent(new window.Event("click"));
      assert.equal(
        document.querySelector("textarea")!.value,
        "1. Implement the layout.\n2. List remaining risks.",
      );
      document.querySelector(".npa-selection-send")!.dispatchEvent(new window.Event("click"));
      await pause();
      assert.deepEqual(sent, ["1. Implement the layout.\n2. List remaining risks."]);
    },
  );
});

test("a Suggested badge shows on read-only cards of earlier replies", async () => {
  const code = "prompt: Verify the layout.\nsuggestion: true\nprompt: Review spacing.";
  const row = (id: string, index: number, content: string) =>
    `<div data-history-row-id="${id}:block:${index}" data-message-id="${id}"><div data-message-text="true" data-testid="assistant-message">${content}</div></div>`;
  const pre = `<div data-paseo-markdown-tag="pre"><div data-paseo-markdown-tag="code">${code}</div></div>`;
  const { document, window } = parseHTML(
    `<html><head></head><body><div id="list">${row("old", 0, '<div data-paseo-markdown-tag="h2"><div>What Next</div></div>')}${row("old", 1, pre)}</div></body></html>`,
  );
  const list = document.querySelector("#list")!;
  const before = list.innerHTML;
  const previous = Object.getOwnPropertyDescriptor(globalThis, "MutationObserver");
  Object.defineProperty(globalThis, "MutationObserver", {
    value: window.MutationObserver,
    configurable: true,
  });
  const cleanup = install(
    { inspect: async () => ({ ...snapshot, candidates: [] }), send: async () => ({ sent: true }) },
    document as unknown as Parameters<typeof install>[1],
    () => ({ ...context, message: "older reply" }),
  );
  try {
    await pause();
    const panel = document.querySelector("[data-next-prompt-actions]") as unknown as El;
    assert.equal(panel.getAttribute("data-npa-readonly"), "true");
    const rows = all(panel, ".npa-row");
    assert.equal(rows.length, 2);
    assert.equal(rows[0].querySelector(".npa-suggested")?.textContent, "Suggested");
    assert.equal(rows[1].querySelector(".npa-suggested"), null);
    assert.equal(rows[0].querySelector(".npa-label")!.textContent, "Verify the layout.");
    assert.equal(panel.querySelectorAll("button, input").length, 0);
  } finally {
    cleanup();
    assert.equal(list.innerHTML, before);
    if (previous) Object.defineProperty(globalThis, "MutationObserver", previous);
    else Reflect.deleteProperty(globalThis, "MutationObserver");
  }
});

test("the Suggested badge style is fixed, small, and placed on every card shape", async () => {
  const code = "prompt: Verify.\nsuggestion: true";
  await withReply(
    { html: nextHtml, message: `## What Next\n\`\`\`text\n${code}\n\`\`\``, code },
    ({ document }) => {
      const css = document.head.querySelector("style")!.textContent!;
      const rule = css.match(/\.npa-suggested\s*\{([^}]*)\}/)?.[1] ?? "";
      assert.match(rule, /background:#0f7b5f/);
      assert.match(rule, /color:#fff/);
      assert.match(rule, /border-radius:6px/);
      assert.match(rule, /font-size:11\.5px/);
      assert.match(rule, /font-weight:600/);
      assert.match(rule, /white-space:nowrap/);
      assert.match(rule, /justify-self:end/);
      assert.doesNotMatch(rule, /position:\s*absolute|var\(--npa-accent\)/);
      // Dark theme keeps the same fixed background.
      assert.doesNotMatch(css, /data-npa-theme="dark"\][^{]*\.npa-suggested/);
    },
  );
});

const fiveItem = (value: string) =>
  `<div data-paseo-markdown-tag="li"><span data-paseo-markdown-ignore="true" data-paseo-markdown-list-marker="true">•</span><div><span>${value}</span></div></div>`;
const fiveList = (...values: string[]) =>
  `<div data-paseo-markdown-tag="h2"><span>Recap</span></div><div data-paseo-markdown-tag="ul">${values.map(fiveItem).join("")}</div>`;

test("a five-field Recap folds into the panel with Not yet and Need from you rows", async () => {
  const block = JSON.stringify({
    version: 1,
    prompts: [{ id: "verify", prompt: "Verify the layout." }],
  });
  const recap = fiveList(
    "Branch: main",
    "Commit/push: yes, committed abc1234",
    "Did: Rewrote the section.",
    "Not yet: Needs a device check.",
    "Need from you: nothing",
  );
  const message = `## Recap\n- Branch: main\n- Commit/push: yes, committed abc1234\n- Did: Rewrote the section.\n- Not yet: Needs a device check.\n- Need from you: nothing\n\n## What Next\n\`\`\`next-prompts\n${block}\n\`\`\``;
  await withReply({ html: recap + nextHtml, message, code: block }, ({ panel }) => {
    const commit = panel.querySelector(".npa-recap .npa-commit") as El;
    assert.equal(commit.textContent!.trim(), "committed abc1234");
    assert.ok(commit.classList.contains("npa-ok"));
    assert.equal(commit.getAttribute("aria-label"), "Commit/push: yes, committed abc1234");
    assert.equal(panel.querySelector(".npa-did")!.textContent!.trim(), "Rewrote the section.");
    const rows = all(panel, ".npa-recap-row");
    assert.equal(rows.length, 1, "a nothing row is omitted");
    assert.equal(rows[0].querySelector(".npa-recap-label")!.textContent, "Not yet");
    assert.equal(rows[0].querySelector(".npa-recap-value")!.textContent, "Needs a device check.");
    assert.equal(panel.querySelectorAll("[data-paseo-markdown-tag]").length, 0);
  });
});

test("a five-field Recap without a prompt block decorates as a stacked strip and restores", async () => {
  const recap = fiveList(
    "Branch: main",
    "Commit/push: no",
    "Did: Rewrote the section.",
    "Not yet: nothing",
    "Need from you: Check the chip.",
  );
  const { document, window } = parseHTML(
    `<html><head></head><body><div data-testid="assistant-message">${recap}<div data-paseo-markdown-tag="h2">Details</div><div data-paseo-markdown-tag="p">Done.</div></div></body></html>`,
  );
  const assistant = document.querySelector('[data-testid="assistant-message"]')!;
  const before = assistant.innerHTML;
  const previous = Object.getOwnPropertyDescriptor(globalThis, "MutationObserver");
  Object.defineProperty(globalThis, "MutationObserver", {
    value: window.MutationObserver,
    configurable: true,
  });
  const cleanup = install(
    { inspect: async () => ({ ...snapshot, candidates: [] }), send: async () => ({ sent: true }) },
    document as unknown as Parameters<typeof install>[1],
    () => ({ ...context, message: "Recap reply" }),
  );
  try {
    await pause();
    const list = document.querySelector("[data-npa-recap]") as unknown as El;
    assert.notEqual(list.getAttribute("data-npa-recap-stacked"), null);
    assert.equal(list.querySelectorAll("[data-npa-recap-field]").length, 5);
    assert.deepEqual(
      all(list, "[data-npa-recap-empty]").map((field) =>
        field.getAttribute("data-npa-recap-field"),
      ),
      ["not yet"],
    );
  } finally {
    cleanup();
    assert.equal(assistant.innerHTML, before);
    if (previous) Object.defineProperty(globalThis, "MutationObserver", previous);
    else Reflect.deleteProperty(globalThis, "MutationObserver");
  }
});
