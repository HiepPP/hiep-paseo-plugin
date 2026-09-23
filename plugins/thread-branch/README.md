# Thread branch

Shows the current git branch of each conversation's working directory as a composer pill,
beside Tasks and Subagents. When the branch has a pull request, a second pill `#42` appears;
one click opens it in the system browser. A third pill named after the `origin` repository opens
its web page (GitHub, GitLab, or any http/ssh remote). A sync pill `↑2 | ↓1` shows commits waiting
to push and to pull against the upstream. Its icon is a green check with **Synced** when there is
nothing to move, an accent upload cloud when only pushing is left, and an amber download cloud when
there is something to pull. It hides when the branch has no upstream, and a click runs `git fetch`
then recounts. Between clicks the pull count reflects the last fetch;
the 15-second poll never fetches.

The branch pill menu offers **Copy branch name**, **Fetch** (runs `git fetch`, shown when the branch
has an upstream), and **Refresh**.
A detached HEAD shows `@<short sha>`. Non-git directories show no pill.

## How it works

- `index.server.ts` runs `git` with fixed arguments in the agent's `cwd` and `gh pr view <branch>`
  for the pull request. PR lookups are cached for 5 minutes per branch; Refresh bypasses the cache.
- `index.client.tsx` lists non-archived agents, follows live agent updates, probes each distinct
  `cwd` every 15 seconds, and updates pills only when the branch state changed so an open menu
  stays open.
- Opening a PR uses the host's external opener when available and React Native `Linking` otherwise.

## Requirements

- `git` on the daemon `PATH`.
- `gh` on the daemon `PATH` and authenticated (`gh auth status`) for PR numbers. Without it the pill
  still shows the branch.

## Install

```bash
cd plugins/thread-branch
npm install
npm run typecheck
npm test
paseo plugin install "$PWD"
paseo plugin ls
```

Reload after source edits with `paseo plugin reload thread-branch`.
