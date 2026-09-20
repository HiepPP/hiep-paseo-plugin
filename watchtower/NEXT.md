# NEXT

## Current Active Plan

- Title: Desktop sidebar Spaces and Board plugins
- Slug: 20260920-arc-style-project-spaces
- Status: ACTIVE
- Updated: 2026-09-20

## Tracker

| Order | TASK | Group | Status | Spec | Deps | Context | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | TASK-001 Confirm desktop sidebar integration | A | DONE | [Spec](tasks/TASK-001-confirm-sidebar-integration.md) | - | [Context](CONTEXT.md) | Desktop sidebar injection approved. |
| 2 | TASK-002 Persist project Spaces | A | DONE | [Spec](tasks/TASK-002-persist-project-spaces.md) | TASK-001 | [Context](CONTEXT.md) | Desktop sidebar injection approved. |
| 3 | TASK-003 Add numbered workspace tabs | A | DONE | [Spec](tasks/TASK-003-workspace-tabs.md) | TASK-002 | [Context](CONTEXT.md) | Desktop sidebar injection approved. |
| 4 | TASK-004 Swipe between Spaces | A | BLOCKED | [Spec](tasks/TASK-004-swipe-between-spaces.md) | TASK-003 | [Context](CONTEXT.md) | Desktop sidebar injection approved. |
| 5 | TASK-005 Move projects between Spaces | A | DONE | [Spec](tasks/TASK-005-move-project-between-spaces.md) | TASK-004 | [Context](CONTEXT.md) | Desktop sidebar injection approved. |
| 6 | TASK-006 Board running and finished tasks | A | DONE | [Spec](tasks/TASK-006-board.md) | - | [Context](CONTEXT.md) | Installed; desktop menu and live run transition verified. Twelve tests pass. |

## Plan Verify

- Run plugin format, typecheck, lint, and tests.
- Verify the plugin runs and the existing sidebar supports tabs, project moves, and scoped wheel events.
- Verify membership survives reload and existing coding workspaces remain intact.
- Record device/browser limitations without claiming untested behavior.

## Handoff

- Board is installed and running. Desktop light/dark, sidebar placement, and a real run transition are verified.
- Board retains 50 observed finished conversations in memory. Native mobile acceptance remains unverified.
- Spaces sidebar adapter implemented and installed. TASK-004 awaits physical swipe acceptance; other Spaces tasks are complete.
- Swipe horizontally across the native left-sidebar project list. Verify one adjacent tab per gesture.
- Fifteen tests, typecheck, lint, native project moves, filtering, and live disable/enable cleanup pass.
- Physical trackpad input remains unverified. Paseo source is unchanged. Mobile retains the standalone fallback.

## Archive

- [Optional plugins](archive/20260918-optional-paseo-plugins/NEXT.md)
