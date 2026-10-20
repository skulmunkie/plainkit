---
type: changed
issue: 1656
---
The agent skills are no longer packaged: they left `core/dist` (so the npm package, `plainkit-dist-<version>.zip` and the `PlainKit.Blazor` NuGet package no longer carry them; the npm package is about 210 KB smaller packed) and are their own page on the Pages site, `skills/` (an index of each skill and its files with an instruction an agent can follow, and a `manifest.json` with size and SHA-256 per file), still attached to each release as `plainkit-skills-<version>.zip`. The `plainkit/skills/*` export of the npm package is removed; the npm package ceilings went down.
