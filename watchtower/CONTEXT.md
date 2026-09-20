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
