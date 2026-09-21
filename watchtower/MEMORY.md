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
