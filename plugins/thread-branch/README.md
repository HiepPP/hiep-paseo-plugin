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

A links pill `3 links` lists the PRs (`#42`), commits (7–40 hex chars), and branches named in the
agent's last reply and opens each on the `origin` remote (GitHub or GitLab routes). Branches count
only as inline code after the word "branch", with a prefix like `feat/`, or as `main`/`master`/
`develop`. The reply is re-read when a turn ends. Refs always resolve against this workspace's
`origin`, so a ref from another repository opens the wrong page.

The branch pill menu offers **Copy branch name**, **Fetch** (runs `git fetch`, shown when the branch
has an upstream), and **Refresh**.
A detached HEAD shows `@<short sha>`. Non-git directories show no pill.

## Turn diff

After each agent turn that changed files or made commits, the thread gets one row:
`2 files changed +14 -3`, then the commits made during the turn (at most 10), then up to 20
files with their `+added -deleted` lines and `and N more`. Binary files show `binary`. A turn
with no change, in a non-git folder, or without a start snapshot (for example after a plugin
reload mid-turn) adds no row.

- At turn start the plugin records `HEAD`, `git diff --numstat HEAD`, and the untracked files of
  the repository. At turn end it diffs the work tree against the start commit, so committed and
  uncommitted changes count once. Files already dirty at turn start count only what changed since.
- New untracked files count their lines; files over 1 MiB show no counts.
- When another agent ran a turn in the same `cwd` at the same time, the row says
  **May include changes from another agent**, because git cannot tell whose edit is whose.
- Click a file to open the **Turn diff** panel beside the agent. It shows only that file, and only
  what changed during that turn. At turn start and end the plugin writes the whole work tree,
  untracked files included, as a git tree object through a copy of the index, so your staging
  area is untouched. The objects stay loose until `git gc` prunes them. Rows from before this
  version, or where a snapshot timed out, are not clickable.
- Images (`png`, `jpg`, `gif`, `webp`, `bmp`, `ico`, `avif`, `svg`) show a Before and After
  preview read from the same snapshots. An image over 3 MB is not previewed.

## Attach a PR

Composer **+** → **GitHub PR** lists open pull requests from the GitHub repositories of all
non-archived Paseo workspaces, newest first, at most 20. Search matches the repository, `#number`,
title, and branch. The picker cannot tell which thread it belongs to, so it always searches every
workspace. Picking a PR adds its repository, number, title, branch, author, URL, check summary, and
the first 4,000 characters of its description to the draft. Nothing is sent until you send it.

- Repositories come from each workspace's `origin` remote; non-GitHub remotes are skipped.
- `gh pr list` runs per repository, at most 3 `gh` calls at once, 15 seconds each. The repository
  list and each PR list are cached for 5 minutes, so a new PR can take up to 5 minutes to appear.
- When a PR has a failed GitHub Actions check, the search starts `gh run view <run> --log-failed`
  in the background. A later search then also offers **CI failure: #42 build** with the last 200
  lines of that log, at most 8,000 characters. The first search after a failure never has it yet,
  because an attachment's text is built during the search and there is no hook when you pick one.
- Without `gh`, or when it is not signed in, the picker is empty and one line is logged. The pills
  and turn diff keep working.

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
