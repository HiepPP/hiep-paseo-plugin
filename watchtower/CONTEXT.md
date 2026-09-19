# Plan Context

## Shared Context

- This plan holds six plugin proposals and a selected UI follow-up. TASK-005 and TASK-007 are complete. TASK-008 is selected.
- The user will select task IDs before any implementation starts.
- A general implement request must first resolve the selected scope. Do not implement the entire backlog by default.
- Each plugin lives in its own directory and remains independently installable.
- All tasks share group A because each updates the root catalog. This does not require selecting them together.
- Use the installed paseo-plugin skill when implementing a selected task.
- Check the target daemon and app versions against matching plugin documentation before choosing APIs.
- TASK-005 uses the installed 0.8.0 SDK. The local daemon and app are version 0.8.0.
- Current plugin documentation was retrieved during implementation.
- Keep credentials and local artifacts out of Git. Preserve the existing Jev plugin.
- Use supported SDK operations and server-side RPC for filesystem, process, and external API access.
- Return cleanup for subscriptions, timers, and owned processes.
- Do not commit or push without a separate user request.
- TASK-005 was installed and reloaded for its authorized runtime verification.

- TASK-007 follows the [dashboard reference](../../watchtower/media/watchtower-dashboard.png), adapted to Paseo themes and layouts.
- The dashboard remains read-only. Task details hold long blocker text.

- TASK-008 opens Watchtower only in Explorer and labels the current project.

## Decisions

- Keep all proposals as TODO until the user selects work.
- Each task can ship alone. Integration with another proposal is optional.
- Suggested priority: workspace-preflight, evidence-ledger, then handoff-pack.

## Open Decisions

- Which remaining task IDs should be implemented?
- Confirm the target host and any external service access when a selected task needs them.

## References

- [Repository rules](../AGENTS.md)
- [Plugin catalog](../README.md)
- [Existing Jev plugin](../plugins/jev-evaluator/README.md)
