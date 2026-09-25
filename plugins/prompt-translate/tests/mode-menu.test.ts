import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { installComposerModeMenu } from "../client/mode-menu";
import { createAgentModes } from "../client/agent-mode";
import type { Doc } from "../client/dom";
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
