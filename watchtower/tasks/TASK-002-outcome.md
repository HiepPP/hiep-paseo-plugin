# TASK-002 Outcome

## Outcome

Status: DONE (in-app check PENDING-USER)

## Changed

- plugins/thread-branch/server/turn-diff.ts (new): start/end snapshots, diff, commits, shared-cwd flag.
- plugins/thread-branch/shared/turn-diff.ts (new): row kind `thread-branch-turn-diff`, version 1, schema, header text.
- plugins/thread-branch/client/turn-diff-card.tsx (new): timeline renderer.
- plugins/thread-branch/index.server.ts: `agent.turn_started` / `agent.turn_ended` hooks; row appended outside the hook.
- plugins/thread-branch/index.client.tsx: registers the renderer; returns one cleanup for pills, renderer, attachment source.
- plugins/thread-branch/tests/turn-diff.test.ts (new).
- plugins/thread-branch/README.md: Turn diff section.
- plugins/thread-branch/server/git.ts (dep fix, not in the file list): exported the existing bounded `run` and `Exec`, added an optional `maxBuffer` parameter (default unchanged, 1 MiB). Only caller was `createBranchReader`; LOW impact (GitNexus has no index for this repo, checked with rg).
- plugins/thread-branch/server/git.ts (review fix): `run` now returns `code: null` when the process is killed or signaled (timeout, maxBuffer), instead of mapping Node's null code to 0. Before, a timed-out `git diff --numstat` / `gh pr list` / `gh run view` looked like success with partial output. plugins/thread-branch/tests/git.test.ts: one test that a timed-out command is not code 0.

## Contract

- Row id `turn-diff:<turnId>`; data `{ fileCount, added, deleted, files[<=20]{path, added|null, deleted|null}, commits[<=10]{sha, subject}, shared }`.
- Header `N files changed +A -D` (plus `· N commits`); then commits, up to 20 files, `and N more`; binary shows `binary`; shared shows "May include changes from another agent".
- No row when nothing changed and no commit, no start snapshot (or turnId mismatch), non-git folder, or unborn HEAD.
- Deviation from the How text, same intent: instead of adding `git diff --numstat <startSha> HEAD` to the HEAD-relative numstat, the end snapshot runs `git diff --numstat <startSha>` (work tree vs start commit). This counts committed and uncommitted changes once and avoids double counting a dirty file that was then committed. Commits still come from `git log <startSha>..HEAD`, max 10.
- Dirty-at-start files count only the change in their numstat since the start. Untracked files are read repo-wide (snapshot runs at the repo top level); new untracked files count lines (over 1 MiB or NUL byte: no counts).

## Verified

Group-level rerun after the review fix (shared run for TASK-002 and TASK-003), in plugins/thread-branch:
- `npm run typecheck` -> exit 0.
- `npm test` -> 34 tests, 34 pass, 0 fail (includes the new timeout test; turn-diff.test.ts: edited, new untracked, deleted, binary, dirty-at-start, commit during turn, no change, no start snapshot, non-git folder, shared cwd, 20-file limit).
- `S=lint; npm run $S` -> 0 warnings, 0 errors.
- `npx oxfmt --check` on all changed/new files (incl. server/git.ts, tests/git.test.ts) -> clean.
- Manual in-app check (reload, edit one file -> one row; question-only turn -> no row): PENDING-USER. Plugin not reloaded, per run rules.

In-app evidence 2026-09-24:
- Test turns 12-14 of agent `9ad0b344` changed no files in `~/.claude` (file mtimes and recaps agree). No row is the expected result.
- The positive case (a turn that edits a file) is not checked in the app yet.

In-app positive check 2026-09-24:
- Probe agent `ac4b5b5a` (Haiku 4.5) created `watchtower/turn-diff-probe.txt` with 3 lines. The raw timeline, read with `@getpaseo/client` `timeline.refetch`, holds the row `turn-diff:foreground-turn-1` of kind `thread-branch-turn-diff`: `fileCount 1, added 3, deleted 0`, the one file, no commits.
- `shared: true` is right. The main session had a turn running in the same `cwd` when the probe started. Files that were already dirty before the turn were left out of the row.
- `paseo agent logs` and the MCP activity summary do not show plugin rows. Read the raw timeline to check them.
- Cleanup: probe file removed and probe agent archived.

Follow-up 2026-09-24: click a file to open its turn diff
- The user asked that a click on a file opens a diff of only that file. No plugin API or URL opens the built-in Changes view for one file: `?open=` takes only agent, terminal, draft, file, and setup. The user picked a plugin-owned panel that shows only the changes from that turn.
- New: `snapshotTree` writes the work tree, including untracked files, as a tree object using a copy of the index. The row gets `source { workspaceId, root, from, to }`. The RPC `thread-branch.file-diff` runs `git diff from to -- path`. The agent panel `turn-diff` shows it, and the card file rows are links.
- Checks: typecheck exit 0; tests 37/37 (3 new: a single-file diff that drops edits made before the turn, no source without a workspace, and `diffLines`); lint 0/0; oxfmt clean.
- Live: probe agent `81089549` created a 2-line file. The row has `source`. `git diff <from> <to> -- watchtower/turn-diff-probe.txt` shows exactly `+alpha +beta`. The user's staging area did not change.
- PENDING-USER: click the file in the probe thread and see the Turn diff panel.

Follow-up 2026-09-24: Paseo-style panel and image preview
- The panel now matches Paseo's diff view: a header with a status badge and `+A -D`, old and new line numbers, green and red row tints, a hunk bar, and sideways scroll. Colors and the gutter formula come from the app bundle. `parseUnifiedDiff` replaced `diffLines`.
- Image files get a Before and After preview. The RPC `thread-branch.file-image` reads each side with `git cat-file blob <tree>:<path>`, at most 3 MB per side, as a `data:` URI.
- Checks: typecheck exit 0; tests 39/39; lint 0/0; oxfmt clean; reload `running`.
- Live: for agent `a804dd0e`, the row for `docs/evidence/20260924-worklist-narrow-sheet-open/after-1664-sheet-open.png` gives `before null`, a 157,050-character `after` URI, and `tooLarge false`.
- PENDING-USER: see the image in the panel.

Follow-up 2026-09-24: card redesign
- Header: a FileDiff icon, the file count, and green `+A` and red `-D`. The commit count sits on the right. The shared-cwd warning and the commits sit in their own section, with icons.
- File rows: a file-type icon, a muted folder with a bold file name (the folder is cut from the left), right-aligned colored counts, 5 GitHub-style diffstat blocks, and a chevron. Rows highlight on hover. The file open in the panel is marked with an accent bar. No underline.
- More than 6 files start folded, with Show N more files and Show fewer files.
- Checks: typecheck exit 0, lint 0/0, tests 39/39, reload `running`. PENDING-USER: visual check.
- Follow-up: the user asked for the full list always. Folding and the Show more toggle were removed. The row still keeps at most 20 files (`TURN_DIFF_MAX_FILES`). Beyond that, "and N more files not listed" shows. Checks: typecheck, lint, and tests 39/39 pass, and reload is `running`.
