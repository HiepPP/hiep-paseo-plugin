# Plan Context

## Shared Context

- The user approved desktop-only injection into the existing left sidebar. Keep all Paseo application source unchanged.
- Numbered tabs sit below the native project list. Existing project menus gain Space destinations.
- Spaces group existing projects; they do not create Git worktrees or coding workspaces.
- Use host-scoped settings for sidebar view-key membership and client-local selection.
- Projects without explicit membership appear in the first remaining Space. Moves include all coding workspaces of that project.
- Opening a coding workspace uses supported navigation and preserves its agents.

## Decisions

- Create numbered Spaces without a fixed three-Space limit.
- Support project menu moves and click/trackpad navigation inside the desktop sidebar.
- Preserve native row contents and actions. Filter group visibility using owned attributes; restore on disable.
- Never store credentials or real prompts. Preserve existing plugin and Paseo checkout changes.

## Board

- Add a separate plugin named Board, with the menu immediately below Schedules.
- Each Board item represents one Paseo agent conversation, per the latest user correction. New turns update the same item.
- The user approved the generated UI on 2026-09-20. The design approval gate is satisfied.
- Verify actual lifecycle states and sidebar placement support against the installed host before implementation.
- Existing Spaces sidebar approval applies to Spaces only. Board must not assume private sidebar integration is approved.
- Board uses standard sidebar registration; the installed desktop places it directly below Schedules without injection.
- Board uses lifecycle outcomes and active snapshots. Recent history resets when the plugin stops or reloads.

## References

- [Arc Spaces](https://resources.arc.net/hc/en-us/articles/19228064149143-Spaces-Distinct-Browsing-Areas): bottom controls and horizontal swipes.
- [Plugin reference](https://paseo.sh/docs/plugins/reference): surfaces, navigation, host settings, and runtime boundaries.
- [Plugin](../plugins/workspace-spaces/README.md): implementation and supported behavior.

## Desktop integration

- The adapter uses private DOM markers and a MutationObserver, gated to Electron.
- The first active installation owns the shared sidebar. Unknown DOM shapes remain visible.
- Browser and native mobile retain the standalone page fallback.
- Pinned rows from uncatalogued hosts remain visible when project identity cannot be resolved.
- Fifteen tests and live sidebar move/filter/disable/enable checks pass. Physical trackpad input remains unverified.
