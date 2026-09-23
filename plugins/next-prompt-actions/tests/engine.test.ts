import { test } from "node:test";
import assert from "node:assert/strict";
import { Engine, type Current, type Judge } from "../server/engine";
import { Store } from "../server/store";
import { readFileSync, unlinkSync, statSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";

const scope = { serverId: "host", workspaceId: "workspace", agentId: "agent" };

test("persisted reservations survive restart without replay or public file permissions", () => {
  const file = path.join(tmpdir(), `npa-test-${randomUUID()}.json`);
  try {
    const store = new Store(file);
    store.get("agent").handled.pending = "sending";
    store.get("agent").enabled = true;
    store.save();
    const restored = new Store(file);
    assert.equal(restored.get("agent").handled.pending, "unknown");
    assert.equal(restored.get("agent").enabled, true);
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.ok(JSON.parse(readFileSync(file, "utf8")));
  } finally {
    unlinkSync(file);
  }
});
function fixture(judge: Judge = async () => true) {
  let current: Current = {
    epoch: "one",
    busy: false,
    complete: true,
    rows: [
      {
        type: "user_message",
        text: "Report test results. Do not commit or push.",
        id: "0",
        timestamp: 1,
      },
      {
        type: "assistant_message",
        text: "## Next Steps\n```\nprompt: Report results.\n```",
        id: "1",
        timestamp: 2,
      },
    ],
  };
  const sent: { text: string; id: string }[] = [];
  let rejectSend = false;
  let duringSend: (() => void) | undefined;
  const store = new Store();
  const driver = {
    async read() {
      return structuredClone(current);
    },
    async send(_scope: unknown, text: string, id: string) {
      sent.push({ text, id });
      duringSend?.();
      if (rejectSend) throw new Error("connection lost");
    },
  };
  const engine = new Engine(store, driver, judge);
  return {
    engine,
    store,
    sent,
    driver,
    get current() {
      return current;
    },
    set current(value) {
      current = value;
    },
    failSend() {
      rejectSend = true;
    },
    onSend(callback: () => void) {
      duringSend = callback;
    },
  };
}
test("manual sends preserve exact text, and concurrent requests submit once", async () => {
  const f = fixture();
  const key = (await f.engine.inspect(scope)).candidates[0].key;
  await Promise.allSettled([f.engine.send(scope, key), f.engine.send(scope, key)]);
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].text, "Report results.");
  await assert.rejects(f.engine.send(scope, key));
});
test("Send all submits every prompt once as one numbered message", async () => {
  const f = fixture();
  f.current.rows[1].text =
    "## Next Steps\n```\nprompt: One\nwhy: Reason.\nprompt: Two\n  line\n```";
  const { candidates } = await f.engine.inspect(scope);
  assert.deepEqual(
    candidates.map((c) => c.why),
    ["Reason.", undefined],
  );
  const keys = candidates.map((c) => c.key);
  await assert.rejects(f.engine.send(scope, [keys[0], keys[0]]));
  await f.engine.send(scope, keys);
  assert.deepEqual(
    f.sent.map((s) => s.text),
    ["1. One\n2. Two\n     line"],
  );
  const states = (await f.engine.inspect(scope)).candidates.map((c) => c.state);
  assert.deepEqual(states, ["sent", "sent"]);
  await assert.rejects(f.engine.send(scope, keys[1]));
});
test("a new turn drops the previous turn's note", async () => {
  const f = fixture();
  await f.engine.send(scope, (await f.engine.inspect(scope)).candidates[0].key);
  assert.equal((await f.engine.inspect(scope)).note, "Prompt sent.");
  f.engine.started("agent");
  f.current.rows.push(
    { type: "user_message", text: "Report results.", id: "2", timestamp: 3 },
    {
      type: "assistant_message",
      text: "## Next Steps\n```\nprompt: Report the next results.\n```",
      id: "3",
      timestamp: 4,
    },
  );
  const snapshot = await f.engine.inspect(scope);
  assert.equal(snapshot.note, "");
  assert.equal(snapshot.candidates.length, 1);
  assert.equal(snapshot.candidates[0].state, "ready");
});
test("a turn starting before the send acknowledgement leaves no note behind", async () => {
  const f = fixture();
  // The daemon starts the turn while handle.send is still awaiting its acknowledgement.
  f.onSend(() => f.engine.started("agent"));
  const key = (await f.engine.inspect(scope)).candidates[0].key;
  await f.engine.send(scope, key);
  assert.equal(f.sent.length, 1);
  assert.equal(f.store.get("agent").handled[key], "sent");
  assert.equal((await f.engine.inspect(scope)).note, "");
  f.current.rows.push(
    { type: "user_message", text: "Report results.", id: "2", timestamp: 3 },
    {
      type: "assistant_message",
      text: "## Next Steps\n```\nprompt: Report the next results.\n```",
      id: "3",
      timestamp: 4,
    },
  );
  const snapshot = await f.engine.inspect(scope);
  assert.equal(snapshot.note, "");
  assert.equal(snapshot.candidates.length, 1);
  assert.equal(snapshot.candidates[0].state, "ready");
});
test("reject stale, busy, incomplete, and non-assistant suggestions", async () => {
  const f = fixture();
  const key = (await f.engine.inspect(scope)).candidates[0].key;
  f.current.busy = true;
  await assert.rejects(f.engine.send(scope, key));
  f.current.busy = false;
  f.current.rows.push({ type: "user_message", text: "Stop.", id: "2", timestamp: 3 });
  await assert.rejects(f.engine.send(scope, key));
  assert.equal(f.sent.length, 0);
  f.current.rows.pop();
  f.current.complete = false;
  assert.equal((await f.engine.inspect(scope)).candidates.length, 0);
  f.current.complete = true;
  f.current.rows[1].type = "tool_call";
  assert.equal((await f.engine.inspect(scope)).candidates.length, 0);
});
test("ambiguous send is retained and cannot retry after engine recreation", async () => {
  const f = fixture();
  f.failSend();
  const key = (await f.engine.inspect(scope)).candidates[0].key;
  await f.engine.send(scope, key);
  assert.equal(f.store.get("agent").handled[key], "unknown");
  const restarted = new Engine(f.store, f.driver, async () => true);
  await assert.rejects(restarted.send(scope, key));
  assert.equal(f.sent.length, 1);
});
test("default OFF and enabling cannot replay existing responses", async () => {
  let evaluations = 0;
  const f = fixture(async () => {
    evaluations++;
    return true;
  });
  f.engine.started("agent");
  await f.engine.ended(scope, true);
  assert.equal(evaluations, 0);
  await f.engine.toggle(scope, true);
  await f.engine.ended(scope, true);
  assert.equal(evaluations, 0);
  f.engine.started("agent");
  await f.engine.ended(scope, true);
  assert.equal(evaluations, 1);
  assert.equal(f.sent.length, 1);
});
test("rejection and evaluator errors fall back to manual without sending", async () => {
  for (const judge of [
    async () => false,
    async () => {
      throw new Error("unavailable");
    },
  ]) {
    const f = fixture(judge);
    await f.engine.toggle(scope, true);
    f.engine.started("agent");
    await f.engine.ended(scope, true);
    assert.equal(f.sent.length, 0);
    assert.match((await f.engine.inspect(scope)).note, /Manual review/);
    await f.engine.send(scope, (await f.engine.inspect(scope)).candidates[0].key);
    assert.equal(f.sent.length, 1);
  }
});
test("OFF during evaluation cancels a positive result", async () => {
  let resolve!: (value: boolean) => void;
  let entered!: () => void;
  const ready = new Promise<void>((r) => {
    entered = r;
  });
  const f = fixture(async () => {
    entered();
    return new Promise<boolean>((r) => {
      resolve = r;
    });
  });
  await f.engine.toggle(scope, true);
  f.engine.started("agent");
  const end = f.engine.ended(scope, true);
  await ready;
  await f.engine.toggle(scope, false);
  resolve(true);
  await end;
  assert.equal(f.sent.length, 0);
});
test("new user turn, interruption, and shutdown invalidate pending judgment", async () => {
  for (const action of ["started", "interrupted", "close"] as const) {
    let resolve!: (value: boolean) => void;
    let entered!: () => void;
    const ready = new Promise<void>((r) => {
      entered = r;
    });
    const f = fixture(async () => {
      entered();
      return new Promise<boolean>((r) => {
        resolve = r;
      });
    });
    await f.engine.toggle(scope, true);
    f.engine.started("agent");
    const end = f.engine.ended(scope, true);
    await ready;
    if (action === "close") f.engine.close();
    else f.engine[action]("agent");
    resolve(true);
    await end;
    assert.equal(f.sent.length, 0);
  }
});
test("automatic chain stops after three sends even when message IDs are absent", async () => {
  const f = fixture();
  await f.engine.toggle(scope, true);
  for (let i = 0; i < 5; i++) {
    f.engine.started("agent");
    await f.engine.ended(scope, true);
    if (i < 3) {
      f.current.rows.push({
        type: "user_message",
        text: f.sent.at(-1)!.text,
        id: `u${i}`,
        timestamp: 10 + i,
      });
      f.current.rows.push({
        type: "assistant_message",
        text: `## Next Steps\n\`\`\`\nprompt: Report results ${i}.\n\`\`\``,
        id: `a${i}`,
        timestamp: 20 + i,
      });
    }
  }
  assert.equal(f.sent.length, 3);
  assert.equal(f.store.get("agent").remaining, 0);
});
test("multiple suggestions require manual selection and context retains user constraints", async () => {
  let seen: Parameters<Judge>[0] | undefined;
  const f = fixture(async (state) => {
    seen = state;
    return false;
  });
  await f.engine.toggle(scope, true);
  f.engine.started("agent");
  await f.engine.ended(scope, true);
  assert.match(seen!.context[0], /Do not commit/);
  f.current.rows[1].text = "## Next Steps\n```\nprompt: One\nprompt: Two\n```";
  seen = undefined;
  f.engine.started("agent");
  await f.engine.ended(scope, true);
  assert.equal(seen, undefined);
});
