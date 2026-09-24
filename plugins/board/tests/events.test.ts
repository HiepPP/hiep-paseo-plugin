import { test } from "node:test";
import assert from "node:assert/strict";
import { installBoardEvents, subscribeSendResult } from "../client/events";

test("Board events open the Board and report send outcomes, keeping an early failure", () => {
  const document = new EventTarget();
  const window = { Event };
  Object.defineProperty(globalThis, "document", { value: document, configurable: true });
  let opened = 0;
  const cleanup = installBoardEvents(() => opened++);
  try {
    document.dispatchEvent(new window.Event("paseo-board:open"));
    assert.equal(opened, 1);
    // Failure before the Board mounts is delivered on the next subscription only.
    document.dispatchEvent(new window.Event("paseo-board:send-failed"));
    const results: boolean[] = [];
    const unsubscribe = subscribeSendResult((sent) => results.push(sent));
    document.dispatchEvent(new window.Event("paseo-board:sent"));
    unsubscribe();
    assert.deepEqual(results, [false, true]);
    const later: boolean[] = [];
    subscribeSendResult((sent) => later.push(sent))();
    assert.deepEqual(later, []);
  } finally {
    cleanup();
    Reflect.deleteProperty(globalThis, "document");
  }
});
