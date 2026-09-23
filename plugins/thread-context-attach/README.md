# Thread context attach for Paseo

Attach the last reply of another Paseo thread to your next message.
This replaces handoff files in `/tmp` and copy-paste between Codex and Claude threads.
Requires Paseo daemon and client 0.8.0+, Node 22+, and enabled trusted plugins.

## Use

Open composer **+ → Thread**, search by title, provider, folder, or agent ID, then select a thread.
Paseo adds one attachment. Its text starts with a header, then the thread's last assistant reply:

```text
# Thread: <title>
Provider: <provider>
Cwd: <cwd>

## Last reply
<reply text>
```

Nothing is sent automatically. Review the composer and press Send yourself.
Attachments are snapshots. Remove and reattach to pick up a newer reply.

## Behavior and limits

- The picker lists up to 12 non-archived threads on the composer's host, newest activity first.
- A thread with no assistant reply attaches `This thread has no assistant reply yet.` instead of failing.
- Replies longer than 20,000 characters keep the first 20,000 and end with a `[Truncated: ...]` marker.
- The last reply is the newest non-empty `assistant_message` in the thread timeline. The plugin reads
  up to 5 pages of 200 entries backward to find it.
- `lastActivityAt` is the newest of the agent's `updatedAt`, `lastUserMessageAt`, and attention time,
  because the daemon agent snapshot has no activity field.
- Snapshots are cached in memory per thread until its activity time changes.
- Paseo passes only the search text to attachment sources, not the composer's agent or workspace.
  The picker therefore cannot put the current workspace first or hide the current thread.
  `thread-context.list-threads` supports both when a caller passes `currentAgentId` or `currentWorkspaceId`.

No repository file is written. No agent is created, messaged, or archived. No credential is needed.

## RPCs

| RPC                                  | Input                                                      | Output                                                                           |
| ------------------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `thread-context.list-threads`        | `{ currentAgentId?, currentWorkspaceId?, query?, limit? }` | `{ threads }` with id, title, provider, cwd, workspaceId, status, lastActivityAt |
| `thread-context.get-thread-snapshot` | `{ agentId }`                                              | Header plus last reply, `hasReply`, `truncated`                                  |
| `thread-context.search`              | `{ query }`                                                | Attachment items for the composer picker                                         |

## Develop

```sh
npm install
npm run format
npm run typecheck
npm run lint
npm test
paseo plugin install "$PWD" --id thread-context-attach
paseo plugin ls thread-context-attach --json
```

After edits, run `paseo plugin reload thread-context-attach` and check `paseo plugin logs thread-context-attach`.
