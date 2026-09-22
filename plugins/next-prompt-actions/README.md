# Next prompt actions

Send a fenced `prompt:` suggestion under `What Next` or `Next Steps` directly from its block.
The desktop adapter preserves native Markdown, copy controls, and the composer draft.
Send sits below the prompt, aligned to the bottom right at every window width.

![A multiline prompt with Send at the bottom right, after all prompt text.](../../docs/images/next-prompt-actions.png)

Captured from Paseo desktop 0.8.0 using synthetic sample text.

## Compatibility

Paseo 0.8.x and 0.9.0-beta.2 desktop only. The user approved this private DOM adapter; it does not edit Paseo source.
It reads native Markdown markers and React ancestor props for host, workspace, message, and agent identity.
Unknown shapes, partial streams, incomplete history, stale messages, and wrong hosts fail closed.
Browser and native mobile clients receive no DOM contribution.

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
