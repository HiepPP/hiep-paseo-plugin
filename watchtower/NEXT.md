# NEXT

## Current Active Plan

- Title: Recap and What Next v2
- Slug: 20260925-next-prompts-v1
- Status: ACTIVE
- Updated: 2026-09-25

## Tracker

| Order | TASK | Group | Status | Spec | Deps | Context | Notes |
|---|---|---|---|---|---|---|---|
| 1 | TASK-001 Next prompts v1 | plugin | DONE | [Spec](tasks/TASK-001-next-prompts-v1.md) | - | [Context](CONTEXT.md) | [Verification](tasks/TASK-001-outcome.md) passed before the global policy update. |

| 2 | TASK-002 Recap and What Next v2 | plugin | IN PROGRESS | [Spec](tasks/TASK-002-recap-next-v2.md) | TASK-001 | [Context](CONTEXT.md) | Direct desktop acceptance required. |

## Plan Verify

- Pass plugin formatting, typecheck, lint, tests, rendering checks, and reload verification.
- Update the global policy only after the plugin gates pass. Preserve its Codex symlink.

## Handoff

- The local plugin is reloaded and the global policy is updated. No commit or push occurred.
- TASK-002 remains IN PROGRESS. Code passes 69 tests; desktop still shows raw JSON after reload. Diagnose client rendering, then verify Edit/Send. See TASK-002 outcome.

## Archive

- Existing plans remain in [archive](archive/).
