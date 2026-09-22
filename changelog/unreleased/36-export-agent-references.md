---
type: added
issue: 36
---
The agent skills (issue #35) are now also exported for developer agents that are not Claude Code: `core/dist/AGENTS.md`, a single-document reference covering the element API, the Blazor components and the SDK's usage workflows, and an `llms.txt` / `llms-full.txt` pair (the [llmstxt.org](https://llmstxt.org) convention: a short index and a full-text version), all served from the Pages site under `dist/` next to `dist/skills/`. All three are generated from the same sources as the skills (`dist/elements/api.json`, `blazor/mappings`, the generator manifest and the gallery data) by `node scripts/build-agent-refs.mjs`, part of `node scripts/bootstrap.mjs`; `--check` runs in CI, and the files carry `core/VERSION` and are listed in `dist/manifest.json` with an SRI hash, the same as the skills.
