# Contributing

Work on Plainkit is tracked in GitHub Issues and closed through pull requests. Nothing is "done" until the issue that describes it is
closed by a merged pull request.

## The flow

1. **Every piece of work has an issue.** Search the open issues first; if there is none, open one with a checklist of what "done" means.
   Big efforts get a `tracking` issue whose checklist links the smaller issues (`- [ ] #16`), so progress shows as they close.
2. **Labels.** `core` (the vanilla toolkit), `blazor` (PlainKit.Blazor and the bridge), `release`, `documentation`, `accessibility`, `bug`,
   `enhancement`, and `tracking` for umbrella issues.
3. **Work on a branch and open a pull request.** Reference the issue in the description with a closing keyword when the pull request
   finishes it (`Closes #12`) and with `Refs #1` when it only advances it. Commits can carry `Refs #n` too.
4. **Tick the checklist as parts land.** Edit the issue when a box is done on the branch; the pull request description says which boxes.
   Leave the issue open until every box is ticked, or split the leftovers into a new issue and close the original.
5. **Merging closes.** A merged pull request with `Closes #n` closes the issue. Do not close an issue by hand unless it was decided against
   (then close it as "not planned" with a comment saying why).

## Definition of done

A change is done when, on its pull request:

- `node --test "core/tests/*.test.mjs" "core/elements/*/*.test.mjs" "core/modules/*/*.test.mjs" "scripts/tests/*.test.mjs"` passes (the last glob checks `blazor/mappings` against the element metas), and `dotnet test PlainKit.slnx` passes.
- `node core/tools/build.mjs` has been run, so `core/dist` is current, and `node scripts/publish-dist.mjs` has copied it into the Blazor package (CI checks both). `node scripts/generate-blazor.mjs` has regenerated the `Pk*` wrappers in `blazor/src/PlainKit.Blazor/Generated/` from `dist/elements/api.json` and `blazor/mappings` (CI runs it with `--check`).
- If an element source or a browser case changed, the in-browser suite was re-run so `core/tests/browser/report.json` is current (`node core/tools/serve.mjs 5341 --write-reports`, open `/tests/browser/` in a visible tab at desktop size, wait for "report saved").
- After a change to `PlainKit.Blazor.csproj`, pack into a scratch folder and list it: `dotnet pack blazor/src/PlainKit.Blazor -c Release -o <dir>`, then `unzip -l <dir>/*.nupkg`. There must be no `content/` or `contentFiles/` entries (the generator manifest stays out of the package), and the DLL, the XML docs and `staticwebassets/` must be there. `scripts/tests/blazor-package.test.mjs` checks the csproj part.
- SDK and Blazor changes ship together: an element change updates its mapping in `blazor/mappings/<name>.json` (the SDK's element meta knows nothing about Blazor) and its generated wrapper (`node scripts/generate-blazor.mjs`; never edit `Generated/` by hand).
- It uses only components that exist in `core`; a missing component is recorded in the "components the SDK lacks" issue instead of being invented locally.
- No internal tracker references, personal paths or real email addresses (`core/tests/privacy.test.mjs` checks).

## Versioning and releases

**One version for everything.** The SDK (`core/dist`) and `PlainKit.Blazor` always carry the same version, kept in `core/VERSION` (SemVer 2.0,
for example `0.1.0-alpha.1`). `tools/build.mjs` stamps it into `dist/manifest.json` and `js/version.js` (`PK_VERSION`), MSBuild reads it for the
NuGet package (`PkAssets.Version`), and `node core/tools/versioning.mjs check` (part of CI) fails when any of them disagree.

**What the number means.** Before 1.0 a breaking change bumps the minor version and is listed under a `### Breaking` heading in the changelog; from
1.0 it bumps the major. A new public item is a minor bump; a fix that changes no API is a patch. Pre-releases (`-alpha.N`, `-beta.N`, `-rc.N`)
come before a version. Public API means classes, tokens and JS exports, and each element's tag, props (type, default, values), slots, events, parts,
CSS properties and methods (`core/site/scorecard/api.baseline.json` holds the previous release's; the Blazor mapping is not part of it). Deprecate
before removing: mark it, log a warning through the logger, keep it for one minor version, remove it in the next.

**When.** `main` is always releasable (CI green, `dist` current). A release is cut when a coherent set of issues has closed, not on every merge;
Pages tracks `main` as "latest" and tags are the pinned releases.

**How: a release pull request.** Branch `release/X.Y.Z`, then:

1. `node core/tools/versioning.mjs bump` shows what the API changes since the last release need; pick a version that covers them.
2. `node core/tools/versioning.mjs set X.Y.Z`, then `node core/tools/build.mjs` and `node scripts/publish-dist.mjs` so the stamp lands in the committed `dist` and in the Blazor package copy.
3. In `CHANGELOG.md` rename "Unreleased" to the version and date (breaking changes under `### Breaking`) and start a new empty "Unreleased".
4. Last, refresh the API baseline for the release: `node core/tools/api-surface.mjs --write --release X.Y.Z`.
5. CI runs `check --release` and `bump --require` against the base branch's baseline: it fails when the baseline was not refreshed, or when the version does not cover the API changes (a breaking change needs a minor bump while the major is 0, a major bump after).
6. Merge, then tag the merge commit `vX.Y.Z` and push the tag. `release.yml` checks that the tag equals `core/VERSION`, publishes `PlainKit.Blazor` to NuGet, attaches the `dist` zip, its manifest and the `.nupkg` to a GitHub release (marked as a pre-release when the version has a `-`), and publishes to npm only if `NPM_TOKEN` is set (pre-releases go to the `next` tag).

Release notes are generated from the merged pull requests, so titles and descriptions should say what changed. See `PUBLISHING.md` for the
one-time setup and how people get a version.
