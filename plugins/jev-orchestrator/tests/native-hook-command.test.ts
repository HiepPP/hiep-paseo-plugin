import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, realpath, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { runNativeHookCommand } from "../server/native-hook-command";
import type { Judge } from "../server/types";

test("native command binds reviewed definitions and workspace before evaluating", async () => {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), "jev-native-")));
  const definitionPath = path.join(directory, "role.toml");
  const manifestPath = path.join(directory, "policy.json");
  const definition =
    'name = "jev-worker-max"\nmodel = "gpt-5.6-luna"\nmodel_reasoning_effort = "max"\n';
  const manifest = {
    cwd: directory,
    policy: {
      runtime: "codex",
      routes: [
        {
          sourceType: "worker",
          candidates: [
            {
              agentType: "jev-worker-max",
              model: "gpt-5.6-luna",
              effort: "max",
              description: "Bounded implementation",
            },
          ],
        },
      ],
    },
    definitions: [
      {
        agentType: "jev-worker-max",
        path: definitionPath,
        sha256: createHash("sha256").update(definition).digest("hex"),
      },
    ],
  };
  const event = {
    hook_event_name: "PreToolUse",
    tool_name: "spawn_agent",
    cwd: directory,
    tool_input: { agent_type: "worker", message: "Implement the requested feature." },
  };
  let calls = 0;
  const judge: Judge = async (_phase, _state, profiles) => {
    calls++;
    return { profileId: profiles[0].id, discovery: false, risk: "low", category: "implementation" };
  };
  try {
    await writeFile(definitionPath, definition);
    await writeFile(manifestPath, JSON.stringify(manifest));
    const allowed = await runNativeHookCommand(event, manifestPath, judge);
    assert.equal(allowed.hookSpecificOutput.permissionDecision, "allow");
    assert.equal(calls, 1);
    const wrongWorkspace = await runNativeHookCommand({ ...event, cwd: "/" }, manifestPath, judge);
    assert.equal(wrongWorkspace.hookSpecificOutput.permissionDecision, "deny");
    assert.equal(calls, 1);
    await writeFile(definitionPath, definition + "# changed");
    const stale = await runNativeHookCommand(event, manifestPath, judge);
    assert.equal(stale.hookSpecificOutput.permissionDecision, "deny");
    assert.equal(calls, 1);
    await writeFile(definitionPath, definition);
    const changingJudge: Judge = async (...args) => {
      await writeFile(definitionPath, definition + "# changed during evaluation");
      return judge(...args);
    };
    const changed = await runNativeHookCommand(event, manifestPath, changingJudge);
    assert.equal(changed.hookSpecificOutput.permissionDecision, "deny");
    assert.equal(calls, 2);
    await writeFile(definitionPath, definition);
    const changingPolicyJudge: Judge = async (...args) => {
      await writeFile(manifestPath, JSON.stringify({ ...manifest, cwd: "/" }));
      return judge(...args);
    };
    assert.equal(
      (await runNativeHookCommand(event, manifestPath, changingPolicyJudge)).hookSpecificOutput
        .permissionDecision,
      "deny",
    );
    assert.equal(calls, 3);
    await writeFile(manifestPath, "{}");
    assert.equal(
      (await runNativeHookCommand(event, manifestPath, judge)).hookSpecificOutput
        .permissionDecision,
      "deny",
    );
    assert.equal(calls, 3);
  } finally {
    await unlink(definitionPath);
    await unlink(manifestPath);
    await rmdir(directory);
  }
});
