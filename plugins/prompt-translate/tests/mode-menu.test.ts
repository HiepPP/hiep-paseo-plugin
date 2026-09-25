import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { installComposerModeMenu } from "../client/mode-menu";
import { createAgentModes } from "../client/agent-mode";
import type { Doc, El } from "../client/dom";
import { translateSettings } from "../shared/settings";

test("composer dropdown saves the agent Caveman mode and cleans up", async () => {
  const { document, window } = parseHTML(
    '<html><head></head><body><div data-testid="message-input-root"><textarea></textarea><div><div><button data-testid="message-input-attach-button">+</button></div><div><button data-testid="agent-provider-selector">Model</button></div></div></div></body></html>',
  );
  let saved = translateSettings.schema.parse({});
  Object.assign(document.querySelector("textarea")!, {
    __reactFiber$test: { memoizedProps: { voiceAgentId: "0c5be16b-a9e0-44c4-8caa-db8aff761e2f" } },
  });
  const client = {
    rpc(contract: { name: string }, input: { mode?: typeof saved.cavemanMode }) {
      if (input.mode) saved.cavemanMode = input.mode;
      return Promise.resolve({ mode: saved.cavemanMode });
    },
  } as unknown as PluginClientContext;
  const state = createAgentModes(client);
  await state.load("0c5be16b-a9e0-44c4-8caa-db8aff761e2f");
  const menu = installComposerModeMenu(client, document as unknown as Doc, undefined, state);
  try {
    const trigger = document.querySelector<HTMLButtonElement>("[data-pt-trigger]");
    assert.ok(trigger);
    assert.equal(trigger.textContent, "Caveman: Default");
    assert.equal(trigger.parentElement?.parentElement?.querySelector("button")?.textContent, "+");
    assert.equal(trigger.parentElement?.nextElementSibling?.textContent, "Model");
    trigger.dispatchEvent(new window.Event("click"));
    assert.equal(document.querySelectorAll('[role="option"]').length, 7);
    assert.equal(trigger.getAttribute("aria-expanded"), "true");
    document
      .querySelector('[data-prompt-translate-option="ultra"]')!
      .dispatchEvent(new window.Event("click"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(saved.cavemanMode, "ultra");
    menu.update();
    assert.equal(trigger.textContent, "Caveman: Ultra");
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
  } finally {
    menu.stop();
  }
  assert.equal(document.querySelector("[data-prompt-translate-mode]"), null);
  assert.equal(document.querySelector("style"), null);
});

test("reusing the composer across agents never leaks its previous mode", async () => {
  const { document } = parseHTML(
    '<html><head></head><body><div data-testid="message-input-root"><textarea></textarea><div><button data-testid="message-input-attach-button">+</button><button data-testid="agent-provider-selector">Model</button></div></div></body></html>',
  );
  const props = { voiceAgentId: "00000000-0000-4000-8000-000000000001" };
  Object.assign(document.querySelector("textarea")!, {
    __reactFiber$test: { memoizedProps: props },
  });
  const client = {
    rpc: async (_contract: unknown, input: { agentId: string }) => ({
      mode:
        input.agentId === "00000000-0000-4000-8000-000000000001" ? "wenyan-ultra" : "follow-agent",
    }),
  } as unknown as PluginClientContext;
  const state = createAgentModes(client);
  await state.load("00000000-0000-4000-8000-000000000001");
  const menu = installComposerModeMenu(client, document as unknown as Doc, undefined, state);
  try {
    assert.equal(document.querySelector("[data-pt-label]")!.textContent, "Caveman: Wenyan Ultra");
    props.voiceAgentId = "00000000-0000-4000-8000-000000000002";
    menu.scan();
    await state.ready("00000000-0000-4000-8000-000000000002");
    menu.update();
    assert.equal(document.querySelector("[data-pt-label]")!.textContent, "Caveman: Default");
    props.voiceAgentId = "00000000-0000-4000-8000-000000000001";
    menu.scan();
    menu.update();
    assert.equal(document.querySelector("[data-pt-label]")!.textContent, "Caveman: Wenyan Ultra");
  } finally {
    menu.stop();
  }
});

test("new-thread menu waits for a real agent UUID before loading modes", async () => {
  const { document, window } = parseHTML(
    '<html><head></head><body><div data-testid="message-input-root"><textarea></textarea><button data-testid="message-input-attach-button">+</button></div></body></html>',
  );
  const props = { voiceAgentId: "new-workspace" };
  Object.assign(document.querySelector("textarea")!, {
    __reactFiber$test: { memoizedProps: props },
  });
  const calls: string[] = [];
  const client = {
    rpc: async (_contract: unknown, input: { agentId: string }) => {
      calls.push(input.agentId);
      return { mode: "follow-agent" };
    },
  } as unknown as PluginClientContext;
  const state = createAgentModes(client);
  const menu = installComposerModeMenu(client, document as unknown as Doc, undefined, state);
  try {
    assert.deepEqual(calls, []);
    assert.equal(document.querySelector("[data-pt-trigger]")!.hasAttribute("disabled"), false);
    document.querySelector("[data-pt-trigger]")!.dispatchEvent(new window.Event("click"));
    document
      .querySelector('[data-prompt-translate-option="lite"]')!
      .dispatchEvent(new window.Event("click"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(document.querySelector("[data-pt-label]")!.textContent, "Caveman: Lite");
    assert.deepEqual(calls, []);
    props.voiceAgentId = "00000000-0000-4000-8000-000000000003";
    menu.scan();
    await state.ready(props.voiceAgentId);
    menu.update();
    assert.deepEqual(calls, [props.voiceAgentId, props.voiceAgentId]);
    assert.equal(document.querySelector("[data-pt-trigger]")!.hasAttribute("disabled"), false);
  } finally {
    menu.stop();
  }
});

test("composer dropdown is fully keyboard operable", async () => {
  const { document, window } = parseHTML(
    '<html><head></head><body><div data-testid="message-input-root"><textarea></textarea><div><button data-testid="message-input-attach-button">+</button><button data-testid="agent-provider-selector">Model</button></div></div></body></html>',
  );
  Object.assign(document.querySelector("textarea")!, {
    __reactFiber$test: { memoizedProps: { voiceAgentId: "00000000-0000-4000-8000-000000000009" } },
  });
  let saved: string = "full";
  const client = {
    rpc: async (_contract: unknown, input: { mode?: string }) => {
      if (input.mode) saved = input.mode;
      return { mode: saved };
    },
  } as unknown as PluginClientContext;
  const state = createAgentModes(client);
  await state.load("00000000-0000-4000-8000-000000000009");
  const menu = installComposerModeMenu(client, document as unknown as Doc, undefined, state);
  const focused: string[] = [];
  const key = (target: El, name: string) => {
    const event = new window.Event("keydown", { bubbles: true, cancelable: true });
    Object.assign(event, { key: name });
    target.dispatchEvent(event);
    return event;
  };
  const option = (mode: string) =>
    document.querySelector(`[data-prompt-translate-option="${mode}"]`)! as unknown as El;
  const watch = () => {
    for (const node of Array.from(
      document.querySelectorAll("[data-prompt-translate-option]"),
    ) as unknown as El[])
      node.addEventListener("focus", () =>
        focused.push(node.getAttribute("data-prompt-translate-option")!),
      );
  };
  try {
    const trigger = document.querySelector("[data-pt-trigger]")! as unknown as El;
    trigger.addEventListener("focus", () => focused.push("trigger"));

    // ArrowDown on the trigger opens the menu and focuses the selected option.
    assert.equal(key(trigger, "ArrowDown").defaultPrevented, true);
    assert.equal(trigger.getAttribute("aria-expanded"), "true");
    watch();
    key(trigger, "ArrowDown");
    assert.deepEqual(focused, ["full"]);
    assert.equal(option("full").hasAttribute("data-pt-active"), true);
    assert.equal(option("full").getAttribute("tabindex"), "-1");

    // Arrow keys move between options and wrap at both ends.
    key(option("full"), "ArrowDown");
    key(option("ultra"), "ArrowUp");
    key(option("full"), "ArrowUp");
    key(option("lite"), "ArrowUp");
    key(option("follow-agent"), "ArrowUp");
    key(option("wenyan-ultra"), "ArrowDown");
    assert.deepEqual(focused, [
      "full",
      "ultra",
      "full",
      "lite",
      "follow-agent",
      "wenyan-ultra",
      "follow-agent",
    ]);
    assert.equal(option("follow-agent").hasAttribute("data-pt-active"), true);
    assert.equal(option("full").hasAttribute("data-pt-active"), false);
    assert.equal(
      document.querySelector("[data-pt-menu]")!.getAttribute("aria-activedescendant"),
      "pt-option-follow-agent",
    );

    // Home/End jump to first and last option.
    key(option("follow-agent"), "End");
    key(option("wenyan-ultra"), "Home");
    assert.deepEqual(focused.slice(-2), ["wenyan-ultra", "follow-agent"]);

    // Escape closes the menu and returns focus to the trigger.
    assert.equal(key(option("follow-agent"), "Escape").defaultPrevented, true);
    assert.equal(document.querySelector("[data-pt-menu]"), null);
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
    assert.equal(focused.at(-1), "trigger");
    assert.equal(key(trigger, "Escape").defaultPrevented, false);

    // Enter on the trigger opens; Enter on an option selects it and refocuses the trigger.
    focused.length = 0;
    assert.equal(key(trigger, "Enter").defaultPrevented, true);
    watch();
    key(option("full"), "ArrowDown");
    assert.equal(key(option("ultra"), "Enter").defaultPrevented, true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(saved, "ultra");
    assert.equal(document.querySelector("[data-pt-menu]"), null);
    assert.deepEqual(focused, ["ultra", "trigger"]);
    assert.equal(document.querySelector("[data-pt-label]")!.textContent, "Caveman: Ultra");

    // Space on the trigger opens; Space on an option selects.
    key(trigger, " ");
    assert.equal(trigger.getAttribute("aria-expanded"), "true");
    assert.equal(option("ultra").getAttribute("aria-selected"), "true");
    key(option("lite"), " ");
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(saved, "lite");
    assert.equal(document.querySelector("[data-pt-menu]"), null);

    // Tab closes the menu without selecting.
    key(trigger, "ArrowUp");
    assert.equal(trigger.getAttribute("aria-expanded"), "true");
    key(option("lite"), "Tab");
    assert.equal(document.querySelector("[data-pt-menu]"), null);
    assert.equal(saved, "lite");
  } finally {
    menu.stop();
  }
});

test("menu stays left of the model selector when the toolbar renders late or reorders", async () => {
  const { document } = parseHTML(
    '<html><head></head><body><div data-testid="message-input-root"><textarea></textarea><div id="row"><div><button data-testid="message-input-attach-button">+</button></div></div></div></body></html>',
  );
  Object.assign(document.querySelector("textarea")!, {
    __reactFiber$test: { memoizedProps: { voiceAgentId: "00000000-0000-4000-8000-000000000010" } },
  });
  const client = {
    rpc: async () => ({ mode: "follow-agent" }),
  } as unknown as PluginClientContext;
  const state = createAgentModes(client);
  await state.load("00000000-0000-4000-8000-000000000010");
  const menu = installComposerModeMenu(client, document as unknown as Doc, undefined, state);
  try {
    const row = document.querySelector("#row")!;
    const wrapper = () => document.querySelector("[data-prompt-translate-mode]")!;
    assert.ok(wrapper());

    // The model selector mounts after the menu, inside a viewport that wraps only it.
    const viewport = document.createElement("div");
    viewport.innerHTML = '<button data-testid="combined-model-selector">Model</button>';
    row.append(viewport);
    menu.scan();
    assert.equal(wrapper().parentElement, row);
    assert.equal(wrapper().nextElementSibling, viewport);

    // A re-render that moves the model selector pulls the menu back beside it.
    row.prepend(viewport);
    menu.scan();
    assert.equal(wrapper().nextElementSibling, viewport);
    assert.equal(document.querySelectorAll("[data-prompt-translate-mode]").length, 1);
  } finally {
    menu.stop();
  }
});
