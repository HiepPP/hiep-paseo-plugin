# Next prompt actions

Send suggestions under `What Next`, `What's Next`, or `Next Steps` directly from their blocks.
Legacy fenced `prompt:` suggestions keep individual Edit and Send controls. They cannot be sent together.
Structured `next-prompts` v1 blocks with several suggestions use selection controls; one suggestion keeps direct Edit and Send.
The raw fence is hidden, not removed.
Explicit Git suggestions replace Send with one action: Commit sends `/commit --no-push`,
Commit & Push sends `/commit` only when push is explicitly requested, and Push sends the
original push-only suggestion without invoking the commit skill. English and Vietnamese action
phrases are recognized conservatively; mentions such as "Review commit" and negated requests keep Send.
No-push constraints take precedence. The original scope and constraints are preserved, with a reminder
to preserve unrelated work. Existing leading `/commit` or `$commit` commands are normalized once.
All actions share Send's busy, stale, and duplicate guards. Git actions require individual manual
clicks; their blocks keep individual controls, and Jev does not auto-run them.
An optional `why:` line under a prompt shows as its reason and is never sent.
An optional `thread: new` line under a prompt marks it as unrelated to the current task (see [Goal and new-thread suggestions](#goal-and-new-thread-suggestions)).
An optional `suggestion: true` or `suggestion: false` line under a prompt marks whether the agent recommends it (see [Suggested badge](#suggested-badge)).
Send preserves the composer draft. Edit replaces it with the selected prompt text for manual review.
Hold Cmd while the pointer is over an enabled Send button to turn it into New thread.
The click then starts that prompt in a new thread instead of sending it here (see below). Git actions keep their normal behavior.
The reverse also works: Cmd over Start in new thread turns it into Send, and the click sends that prompt here.
An Other work prompt that mentions commit or push still starts in a new thread and swaps only to a plain Send; it is never wrapped in `/commit`.
This needs an idle conversation and no Jev review in progress.
The swap changes no button size, and the click always does what the button shows.

## Recap and next-step layout

A suggestion block under What Next becomes one panel ([design](../../docs/designs/recap-next-panel-2026-09-25/panel-v3.html), [rules](../../docs/designs/recap-next-panel-2026-09-25/TASTE.md)).
The panel shows a directly preceding Recap (branch, commit status, and work summary), the What Next title and intro, and the suggestions.
A Recap joins the panel, or shows as a compact strip when no panel follows. Two field sets are recognised, each followed by What Next or Next Steps.
Fields may span separate history rows; late or changed blocks trigger a fresh fold. Inline code and links are preserved.
Any other field set or order, a missing label, an extra unlabeled block, or a quoted Recap keeps its original rendering.
Native Markdown is hidden in place, not removed, and returns when the plugin is disabled.

- Five fields, in this order: `Branch`, `Commit/push`, `Did`, `Not yet`, `Need from you`.
  `Commit/push` is `no`, or `yes` followed by detail such as `yes, committed abc1234`, `yes - pushed main`, or `yes committed abc1234`.
  `Did`, `Not yet`, and `Need from you` may each hold sub-bullets. Write `nothing` for a field with nothing to report.
- Legacy three fields: `Branch`, `Did`, `Commit/push`. It still renders exactly as before, in the panel and as a compact strip.

Accepted shapes of the five-field Recap:

- One top-level bullet list with exactly five items, one per label. Nested lists are allowed only inside Did, Not yet, and Need from you.
- Labeled lines, as one or more paragraphs with one field per line. A label line may be followed directly by a top-level
  bullet or numbered list that belongs to that field. The list may follow Did, Not yet, or Need from you only.
  A label with an empty value, such as `Not yet:`, is valid only when such a list follows it.
  Labeled lines join the panel only; with no panel they keep their native rendering, as the legacy lines do.

```markdown
## Recap

Branch: main
Commit/push: no
Did: Rewrote the section. +12/-8.
Not yet:

- Item one.
- Item two.

Need from you: Open a new session and check the chip.
```

In the panel, the header shows a Branch chip and a Commit chip. The Commit chip maps its value like this; the chip's `aria-label` keeps the full original value (`Commit/push: <value>`).

| Value                                                    | Chip text                                                               | Icon   |
| -------------------------------------------------------- | ----------------------------------------------------------------------- | ------ |
| `no`, or legacy `none`, with an optional trailing period | No commit                                                               | commit |
| `yes` alone                                              | Committed                                                               | check  |
| `yes` plus detail, such as `yes, committed abc1234`      | the detail without `yes` and its separator, such as `committed abc1234` | check  |
| legacy `committed ...` or `pushed ...`                   | the value as written                                                    | check  |
| anything else                                            | the value as written                                                    | commit |

The body of a five-field Recap is split into small sections, Did, Not yet, and Need from you. Each has its label above its value, with a divider line between sections and sub-bullets kept as a list.
The legacy three-field Recap keeps its single unlabeled Did line.
A Not yet or Need from you section whose value is `nothing`, in any case and with an optional trailing period, is omitted. As a compact strip, the five-field list stacks:
Branch and Commit/push on the first row, then Did, Not yet, and Need from you each on a full-width row, with `nothing` rows hidden.
Each of those three rows is a section like the panel's: the label sits above the value. The label and value are a plugin-owned copy inside the list item; the native nodes stay in place, hidden, and return when the strip is removed. The legacy strip keeps its native text.

- Current reply: the panel has controls. One suggestion gets direct Edit and Send. Several suggestions separate exclusive
  choices from additional suggestions, with a shared bar for the count, Edit selected, and Send selected.
  No alternatives or default selections are invented.
- Earlier replies: once a newer turn starts, the server no longer offers their suggestions. Their panels stay readable
  but have no buttons or inputs. This applies only when the nearest heading above the block is What Next or Next Steps.

Paseo renders each Markdown block of a reply as its own history row, so the panel joins rows that share a message ID.
Rows mounted while scrolling are folded before paint to avoid layout jumps in the virtualized history.

## Structured suggestions

Use one JSON fence with the language `next-prompts`. The first suggestion is the recommended next step.

````markdown
## What Next

```next-prompts
{
  "version": 1,
  "prompts": [
    { "id": "implement", "prompt": "Implement the settings layout.", "why": "Apply the agreed design." },
    { "id": "review", "prompt": "Review the settings layout. Do not change code." },
    { "id": "risks", "prompt": "List remaining risks." }
  ],
  "exclusiveGroups": [["implement", "review"]],
  "allowedCombinations": [["implement", "risks"], ["review", "risks"]]
}
```
````

- `version` must be `1`. Each prompt has a unique lowercase ID, exact `prompt` text, an optional `why`, an optional
  `"thread": "new"`, and an optional `"suggestion": true` or `false`. The block may set `"goal": "done"`.
- `exclusiveGroups` declare disjoint radio groups. Each group permits at most one selection, not a required selection.
- Other suggestions use checkboxes. Nothing is selected automatically. Clear selection resets all controls.
- `allowedCombinations` lists exact permitted sets of IDs. Subsets, supersets, and transitive combinations are not inferred.
- Both relationship arrays may be omitted; the default is no permitted bulk sends. Single sends remain available.
- Checkboxes are grouped by declared combinations ([design](../../docs/designs/next-prompts-combos-2026-09-27/combos.html)):
  Send together holds suggestions linked by combinations (numbered sets when there are several), Follow-up holds those
  whose combinations include an exclusive choice, and Send alone holds suggestions in no combination.
- A suggestion that no declared combination can join with the current selection is disabled and labelled
  "Not with selection" or "Send alone". A selection that fits a combination only partially keeps Send disabled.
- The server revalidates every selection from the current reply. Separate fences cannot be combined.
- Selected prompts are sent in authored order as one numbered message. Only `prompt` text is sent, never IDs, relationships, or reasons.
- Busy, stale, duplicate, uncertain-send, and individual Git-action guards still apply. Blocks containing Git actions use individual controls.
- Relationships declare intent; they do not prove semantic compatibility, grant permissions, or authorize parallel execution.

Unknown fields, versions, invalid references, overlapping exclusive groups, duplicate IDs or sets, and contradictory declarations reject the entire block.
Malformed, partial, or unsupported blocks remain visible as plain code without plugin controls.
Limits: 64 KiB per JSON block, 1–20 prompts, 16,000 characters per prompt, 2,000 per reason,
64 characters per ID (`[a-z][a-z0-9-]*`), 20 exclusive groups, and 64 allowed combinations.
Each group or combination contains 2–20 distinct IDs. Legacy blocks retain their existing parser limits.

## Suggested badge

The agent marks each prompt it recommends doing next. Several prompts, including new-thread prompts, may be suggested.

- Structured fence: `"suggestion": true` or `"suggestion": false` on a prompt. Absent means `false`.
  A value that is not a boolean counts as `false`; it never rejects the block.
- Legacy fence: a `suggestion: true` or `suggestion: false` line under a prompt, matched without regard to case like `thread: new`.
  The first such line of a prompt decides. These lines are never part of the prompt text. Other values, such as `suggestion: maybe`, stay in the prompt text.
- A suggested prompt shows a `Suggested` badge at the top right of its card: the direct Edit and Send card, the checkbox and radio row,
  the read-only card of an earlier reply, and the Other work card. The badge sits in its own grid row above the text, reason, buttons, and choice state, so it never covers them.
  It uses the fixed fill `#0f7b5f` with white text in both themes. It is plain text that assistive tech reads, and a selection input is described by it.
- The flag is display only. It never changes the sent prompt text, selection rules, relationship validation, or Git-action detection. Cards without it render as before.

## Goal and new-thread suggestions

- `"goal": "done"` at the top of a `next-prompts` block says the reply finished its task. The panel shows a
  Task done chip in the Recap header, or next to the What Next title when no Recap is folded.
- `"thread": "new"` on a prompt, or a `thread: new` line in a legacy fence, marks work unrelated to the current task.
  These prompts appear in a separate Other work section with one Start in new thread button and no Edit or Send.
- Start in new thread creates a separate conversation with the source conversation's directory, provider, model,
  mode, and thinking option; the prompt is its first message. It works while this conversation is busy.
  The source conversation, its composer draft, and Board events are unchanged.
- A start is reserved before dispatch and uses the suggestion key as the idempotency key; an uncertain result shows
  Check threads and is never retried.
- New-thread prompts cannot appear in `exclusiveGroups` or `allowedCombinations`; such a block is rejected.
  Send rejects them server-side unless one is sent alone by a manual Cmd-click. Jev auto-run ignores them.

## Compatibility

Desktop only; the installed runtime used for this change is Paseo 0.9.1.
The manifest also permits 0.8.x and 0.9.0-beta.2; this change was not runtime-tested on those versions.
The user approved this private DOM adapter; it does not edit Paseo source.
It reads native Markdown markers and React ancestor props for host, workspace, message, and agent identity.
Unknown shapes, partial streams, incomplete latest turns, stale messages, and wrong hosts fail closed.
A reply gets actions only when its rendered timestamp is later than the latest user message. Exact row timestamps
are not compared, because a reply watched while streaming keeps its last live chunk time.
Browser and native mobile clients receive no DOM contribution.

## Back to Board after send

Settings → Next prompt actions → Back to Board after send. Host setting; defaults OFF.
When ON, any manual send action opens the Board at once while the send finishes in the background.
The Board refreshes when the send is acknowledged and shows a warning toast if it failed or is uncertain.
Requires the `board` plugin, which listens for `paseo-board:v2:open`, `paseo-board:v2:sent`, and `paseo-board:v2:send-failed`.

Missing or disabled Board registration adds a warning to suggestion panels. Manual Send stays available.

## Jev auto-run

The per-conversation setting defaults OFF. Turning it ON applies only to new turns, never old suggestions.
Jev evaluates the original user goal, user-message context, and the proposed continuation.
Exactly one suitable suggestion with a positive `send` decision probability above 0.5 can be sent.
This judgment is not proof of correctness and does not change agent permissions or grant new authority.
Missing context, multiple suggestions, failed evaluations, and rejected decisions require manual Send.
Each chain is limited to three evaluations/sends. User interruption, permission requests, or OFF cancel pending automation.
Use Command Center → Toggle Jev next-prompt auto-run to enable or disable automation for the current conversation.
Prompt blocks contain Send and action status only; they do not contain the automation setting.

Requires the existing directory-installed `jev-evaluator` plugin and its Gateway configuration.
Evaluation runs in a Node child with the existing evaluator contract; no new chat provider is created.
Credentials remain server-side. Each evaluation uses API quota; no automatic API retries occur.
Local settings, deduplication hashes, and the chain's user goal live under `$PASEO_HOME/plugin-data/next-prompt-actions/`.
Never add those files to Git. A send with an uncertain acknowledgement displays Check chat and cannot retry automatically.

## Install and verify

```sh
npm install
npm run format
npm run typecheck
npm run lint
npm test
paseo plugin install "$PWD" --id next-prompt-actions
paseo plugin ls next-prompt-actions --json
```

For updates, run the checks then `paseo plugin reload next-prompt-actions`.
Check actual Send, target conversation, preserved draft, dark/light layout, and toggle behavior after reload.
Disable removes owned DOM controls, styles, listeners, and cancels pending evaluations.

Long threads need only a contiguous timeline tail containing the latest user message and reply.
Older omitted turns do not hide Send; gaps or a missing latest-turn boundary still fail closed.

Missing evaluator files or Gateway SDK add a specific warning. Auto-run cannot be enabled until restored; manual Send remains available.

Board notifications carry the sending host ID. Update Board on that host for Back to Board support; older listeners safely ignore the versioned events.
