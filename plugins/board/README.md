# Board

Paseo conversation board. The Board sidebar item opens Running and Just finished columns.
Requires Paseo daemon and client 0.8.x. Uses standard plugin surfaces, sidebar registration, RPCs, and lifecycle hooks.

## Behavior

- Use **UI size − / +** in the Board header to scale Board text, cards, and spacing from 10% to 150% in 10% steps. Click the percentage to reset to 100%. The control sits in a fixed toolbar outside the scrolling, scaled content, keeping its size and click position unchanged; Paseo navigation and other pages are unaffected. The preference lasts until the client/plugin reloads.

- Unstarred cards are grouped by host project identity within each column, with a project name and count. Same-name projects stay separate; when placement is unavailable, the full working directory identifies the group. Empty groups disappear.
- Starred cards sit above all project groups in their column and keep their project label. Unstarring returns a card to its project. Group order follows the first unstarred card in the existing column order.

- Star a card using its top-right button to put it first in either column. Stars follow conversations between columns and new turns, and are shared across connected clients. Like Board history, stars are in memory and reset on plugin reload; the existing 50-finished-card retention still applies.
- Each card represents one Paseo agent conversation. New turns update the same card and move it between columns.
- Click a card to open its conversation on the selected host. Remove is a separate action and does not navigate.
- Finished conversations also show a Remove button at the top-right of the thread on desktop (beside the composer on native clients). Successful removal returns to Board; failures keep the conversation open. Membership refreshes every two seconds.
- A removed conversation appears again when it starts a new turn. Status and duration describe the latest turn.
- Remove hides a finished card from Board on all connected clients. It never deletes or archives the agent or chat.
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
