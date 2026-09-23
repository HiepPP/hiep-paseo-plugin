# Planning Memory

## Core Intent

- Improve autonomous Paseo delegation through plugins, without editing Paseo application source.
- Route subagents using valid saved profiles and measured task outcomes.

## Planning Rules

- Keep provider settings intact and preserve explicit user selections.
- Separate deterministic verification, model judgments, and live runtime evidence.
- Keep raw prompts, credentials, and local run state outside Git.

## Source Anchors

- [Jev evaluator](../plugins/jev-evaluator/) provides the existing Gateway evaluation contract.
- [Orchestrator](../plugins/jev-orchestrator/) owns autonomous delegation.

## Verified Integration Lessons

- Installed Paseo 0.8 server bundling failed on a direct AI SDK import; a standalone Node worker loads Gateway successfully.
- Re-evaluate readiness after discovery. A review finding must not train routing as a successful outcome.
- Keep interrupted benchmark samples and distinguish extra review work from routing-speed comparisons.
- 2026-09-23: The daemon rejects camelCase plugin RPC names such as `threadContext.listThreads`. Use lowercase-hyphen names such as `thread-context.list-threads`.
- 2026-09-23: An attachment-source search receives only `{ query }`. It cannot know the current thread or workspace.
- 2026-09-23: SDK 0.9.0-beta.2 agent snapshots have no `lastActivityAt`. Use the newest of `updatedAt` and `lastUserMessageAt`.
- 2026-09-23: A local command hook rewrites a literal `npm run lint` and exits 1. Run `S=lint; npm run $S` to get the real oxlint result.
- 2026-09-23: The Paseo sidebar lists workspaces, not agents. Archiving agents leaves their workspace rows visible. Archive the workspace too, but never a Paseo-owned worktree, because that can remove its directory.
