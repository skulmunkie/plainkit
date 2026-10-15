---
type: changed
issue: 1253
---
The npm package no longer carries the `plainkit-blazor` agent skill (about 124 KB packed, the package is now about 935 KB): it is only useful in a Blazor project, which gets it from the `PlainKit.Blazor` NuGet package, the `plainkit-skills-<version>.zip` release asset and the Pages site (`https://skulmunkie.github.io/plainkit/dist/skills/plainkit-blazor/`). `plainkit-sdk` stays in the package, and `dist/llms.txt` now links the Blazor skill files at their Pages URLs. Migration: a project that read `skills/plainkit-blazor/*` from `node_modules/plainkit` takes it from NuGet or the skills zip. The package size ceilings are lowered to 942,000 packed and 3,650,000 unpacked bytes.
