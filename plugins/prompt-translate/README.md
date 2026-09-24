# Prompt translate

Learn English prompting from your own Vietnamese prompts, on Paseo desktop.

- Each new Vietnamese prompt shows its English translation inside the user bubble, labeled `EN`.
- Cmd/Ctrl+Enter in the composer rewrites the draft as a clear English prompt and sends it as if
  you pressed Enter, so it follows your send-or-queue preference while the agent runs. Esc during
  the rewrite cancels it. The sent bubble shows your Vietnamese original, labeled `VI gốc`.
  If the host does not send it (for example in a compact window), the prompt stays in the
  composer with a hint to press Enter.

Both features switch on or off under Settings → Plugins → Prompt translate.

## Compatibility and limits

Paseo 0.8.x and 0.9.x desktop only, through a private DOM adapter. Paseo updates can break it; it
then shows nothing rather than failing. Browser and mobile clients receive no contribution.
While the shortcut is on, Cmd/Ctrl+Enter no longer queues a message from the keyboard; use the
Queue button. Prompts sent before translation was switched on are shown only from the cache and
are never sent to a model.

## Privacy and credentials

Prompt text is sent to the selected third-party provider. Keys stay on the daemon and are read on
every call:

- OpenRouter (default): `OPENROUTER_API_KEY` in the daemon environment, else the macOS Keychain
  generic password for the current user with service `OPENROUTER_API_KEY`, then
  `TEXT_MODEL_API_KEY`.
- Vercel AI Gateway: `agents.providers.vercel-gateway.env.OPENAI_API_KEY` (and optional
  `OPENAI_BASE_URL`) in the daemon's `config.json`. The free tier blocks some models and
  rate-limits bursts.

The cache lives at `$PASEO_HOME/plugin-data/prompt-translate/cache.json`. Never add it to Git.

## Models

Default for both translate and enhance: `google/gemini-2.5-flash-lite`, chosen from a benchmark
on OpenRouter on 2026-09-24 (15 calls per cell, 3 synthetic samples, total time p50/p90):

| Model                          | Translate       | Enhance         |
| ------------------------------ | --------------- | --------------- |
| `google/gemini-2.5-flash-lite` | 935 / 1244 ms   | 858 / 1223 ms   |
| `google/gemini-3.5-flash-lite` | 1057 / 1268 ms  | 1187 / 1458 ms  |
| `google/gemini-3.1-flash-lite` | 1142 / 1553 ms  | 1174 / 1547 ms  |
| `openai/gpt-4.1-nano`          | 1329 / 3175 ms  | 1133 / 2450 ms  |
| `anthropic/claude-haiku-4.5`   | 1618 / 2285 ms  | 1770 / 2440 ms  |
| `openai/gpt-oss-120b`          | 9572 / 19859 ms | 3668 / 15608 ms |

Output quality was reviewed only for the default model. Change models in settings.
`npm run benchmark -- --provider=openrouter --runs=1 --models=<id>` re-measures; every call
consumes quota, and raw outputs are written only when the run finishes.

## Install and verify

```sh
npm install
npm run format && npm run typecheck && npm run lint && npm test
paseo plugin install "$PWD" --id prompt-translate
paseo plugin ls prompt-translate --json
```
