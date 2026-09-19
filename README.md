# Hiep Paseo plugins

Independent local plugins for Paseo. Each plugin lives in `plugins/<plugin-id>/`
with its own manifest, dependencies, checks, and installation.

| Plugin | Purpose |
| --- | --- |
| [jev-evaluator](plugins/jev-evaluator/README.md) | Expose Jev evaluations as an MCP tool for Codex and Claude agents. |
| [watchtower-board](plugins/watchtower-board/README.md) | Browse read-only Watchtower tasks and attach task briefs in the composer. |
| [workspace-preflight](plugins/workspace-preflight/README.md) | Discover workspace prerequisites, expose read-only MCP evidence, and optionally ask Jev for task relevance. |

## Install a plugin

```sh
cd plugins/jev-evaluator
npm ci
npm run typecheck
npm run lint
npm test
paseo plugin install "$PWD" --id jev-evaluator
```

After editing a plugin, run its checks and `paseo plugin reload <plugin-id>`.
See each plugin README for requirements and configuration.

## Add another plugin

Create `plugins/<plugin-id>/` with its own `paseo-plugin.json` and runtime entry.
Install and manage each plugin independently; no root workspace build is required.
