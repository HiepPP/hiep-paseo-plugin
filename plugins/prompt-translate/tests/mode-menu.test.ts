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
  const props = { voiceAgentId: "agent-a" };
  Object.assign(document.querySelector("textarea")!, {
    __reactFiber$test: { memoizedProps: props },
  });
  const client = {
    rpc: async (_contract: unknown, input: { agentId: string }) => ({
      mode: input.agentId === "agent-a" ? "wenyan-ultra" : "follow-agent",
    }),
  } as unknown as PluginClientContext;
  const state = createAgentModes(client);
  await state.load("agent-a");
  const menu = installComposerModeMenu(client, document as unknown as Doc, undefined, state);
  try {
    assert.equal(document.querySelector("[data-pt-label]")!.textContent, "Caveman: Wenyan Ultra");
    props.voiceAgentId = "agent-b";
    menu.scan();
    await state.ready("agent-b");
    menu.update();
    assert.equal(document.querySelector("[data-pt-label]")!.textContent, "Caveman: Default");
    props.voiceAgentId = "agent-a";
    menu.scan();
    menu.update();
    assert.equal(document.querySelector("[data-pt-label]")!.textContent, "Caveman: Wenyan Ultra");
  } finally {
    menu.stop();
  }
});
