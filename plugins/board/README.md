# Board

Paseo conversation board. The Board sidebar item opens Running and Just finished columns.
Supports Paseo daemon and client 0.8.x and 0.9.0-beta.2. Uses standard plugin surfaces, sidebar registration, RPCs, and lifecycle hooks.

## Behavior

- Use **UI size − / +** in the Board header to scale Board text, cards, and spacing from 10% to 150% in 10% steps. Click the percentage to reset to 100%. The control sits in a fixed toolbar outside the scrolling, scaled content, keeping its size and click position unchanged; Paseo navigation and other pages are unaffected. The preference lasts until the client/plugin reloads.

- Parent and subagent conversations form nested clusters with a **subagents** toggle. Clusters start expanded; collapse state lasts while Board stays mounted, including refreshes and column changes. Compact layouts use a smaller indent. Collapsed groups summarize how many members are running or need input; subagent cards omit the project row when it matches the parent.
- Relationships come from Paseo parent metadata, never titles or project names. Missing or removed parents leave their children visible as standalone cards. Provider-internal subagents without a separate Paseo conversation are not listed.
- A cluster stays in Running while any member runs; otherwise it moves to Just finished, ordered by its latest completion. Counts include all conversations, even collapsed descendants. Each card keeps its own status, star and open actions. Remove appears once a card and all of its subagents have finished, labelled **Remove all · N** on parents; removing a card also removes its finished subagents on all connected clients. Removing from the thread view while a subagent is still running keeps that subagent and its own subtree visible as standalone cards.
- Cards are flat, single-border surfaces. Project groups are tinted containers headed by a project mark (rounded square with the project's initial, as in the sidebar), the name, and a count when more than one conversation is inside. Running cards show a small spinner beside the status; needs-input cards show a warning badge and failed cards a red status label. Subagents render as mini cards on an inset panel inside their parent card, joined by a rail with elbow connectors, labelled **Subagent**.
- Unstarred clusters are grouped by host project identity within each column, with a project name and count. Same-name projects stay separate; when placement is unavailable, the full working directory identifies the group. Empty groups disappear.
- Project block colors are saved in host settings by Paseo project ID. New IDs receive the pastel hue farthest from all assigned hues; existing assignments survive reloads and restarts. Unresolved projects use a neutral border until an ID is available. Removing the plugin registration deletes its settings. With many projects, colors become less distinct.
- A star on any member puts the whole cluster above project groups, without duplicating or detaching children. The cluster returns to its root conversation's project when no member is starred. Group order follows the existing column order.

- Star a card using its top-right button to put it first in either column. Stars follow conversations between columns and new turns, and are shared across connected clients. Like Board history, stars are in memory and reset on plugin reload; the existing 50-finished-card retention still applies.
- Each card represents one Paseo agent conversation. New turns update the same card and move it between columns.
- Click a card to open its conversation on the selected host. Remove is a separate action and does not navigate.
- Finished conversations also show a Remove button at the top-right of the thread on desktop (beside the composer on native clients). Successful removal returns to Board; failures keep the conversation open. Membership refreshes every two seconds.
- A removed conversation appears again when it starts a new turn. Status and duration describe the latest turn.
- Remove hides a finished card, and its finished subagents, from Board on all connected clients. It never deletes or archives the agent or chat.
- Running cards refresh from the host every two seconds while the page is open.
- Completion, failure, and cancellation come from actual lifecycle outcomes. Idle never implies success.
- Missing terminal events show Outcome unknown. A later terminal event can resolve that state.
- Keeps the latest 50 finished conversations in memory, observed since plugin startup. Reload, disable, or daemon restart clears history.
- Runs already active when the page opens are recovered from the host. Earlier finished history is unavailable.
- Start times use the daemon timestamp when available. Hook-only times and end times are observed locally.
- A missing start time has no duration. Lifecycle delivery is best-effort; this is not an audit log.
- Project names use the host placement when available, otherwise the working directory name.
- Data stays on the selected host and connected client. No credentials, prompts, or transcripts are stored by Board.

## Sidebar

On macOS desktop, Cmd+D opens Board, including from the chat composer. The listener is removed when Board stops.
Clear the conflicting Start/stop dictation shortcut in Paseo Settings → Shortcuts; this was done on the current client.
The microphone button remains available. Browser and mobile clients use the Board menu.

Board uses the native sidebar contribution. With the default navigation and current plugin set, it follows Schedules.
Paseo owns ordering; customized clients can move Board below Schedules in Settings → Appearance → Sidebar navigation.
The plugin does not overwrite user preferences or modify Paseo source. The desktop Remove placement uses a scoped DOM adapter; the action remains agent-scoped and owned by Paseo.

## Checks and install

```sh
npm ci
npm run format
npm run typecheck
npm run lint
npm test
paseo plugin install "$PWD" --id board
paseo plugin reload board
paseo plugin ls board --json
paseo plugin logs board
```

Lifecycle listeners are removed on disable, and in-flight list results are discarded after stop.
The UI supports host themes and stacks columns on compact clients; runtime acceptance must record tested clients separately.
