---
type: changed
---
Generated files are no longer in the repository: `core/dist`, the element modules, the Blazor wrappers, the agent skills and the package copy of `dist` are produced by `node scripts/bootstrap.mjs` (Node only, about 4 seconds) on a fresh clone, in CI and in every workflow, so pull requests carry no generated diffs and cannot conflict on them. `dotnet build` stops with a one-line instruction when they are missing, and `node core/tools/serve.mjs` generates them itself. A git tag no longer carries `core/dist`, so the jsDelivr-by-tag link is no longer advertised: pinned versions are the GitHub release zip and the NuGet package, and the Pages site is the latest `main`.
