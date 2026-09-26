# Contributing

Work on Plainkit is tracked in GitHub Issues and closed through pull requests. Nothing is "done" until the issue that describes it is
closed by a merged pull request. Development is trunk-based: `main` is always releasable, and work reaches it in small pull requests.
Agents follow [AGENTS.md](AGENTS.md), which has the same flow as commands and rules.

## The flow

1. **Every piece of work has an issue.** Search the open issues first; if there is none, open one with a checklist of what "done" means.
   Big efforts get a `tracking` issue whose checklist links the smaller issues (`- [ ] #16`), so progress shows as they close.
2. **Labels.** `core` (the vanilla toolkit), `blazor` (PlainKit.Blazor and the bridge), `release`, `documentation`, `accessibility`, `bug`,
   `enhancement`, and `tracking` for umbrella issues.
3. **One issue, one short-lived branch, one small pull request.** Branch from the latest `main` (agents name it `agent/<issue>-<slug>`), aim for
   about 400 lines of hand-written source (generated files do not count), and split bigger issues into steps that each leave `main` releasable.
   Reference the issue in the description with a closing keyword when the pull request finishes it (`Closes #12`, one per line: GitHub closes only
   the first issue of a list) and with `Refs #1` when it only advances it. Commits can carry `Refs #n` too. Squash-merge; the branch is deleted.
4. **Tick the checklist as parts land.** Edit the issue when a box is done on the branch; the pull request description says which boxes.
   Leave the issue open until every box is ticked, or split the leftovers into a new issue and close the original.
5. **Merging closes.** A merged pull request with `Closes #n` closes the issue. Do not close an issue by hand unless it was decided against
   (then close it as "not planned" with a comment saying why). Agents comment and tick checklists and put `Closes #n` on the pull request that finishes an issue, so the merge closes it; they never close issues by hand.

> **Windows:** a checkout path that is deep (an agent worktree, a long user profile) can exceed the path limit that git and `dotnet test`
> tolerate. Run `git config core.longpaths true`, and keep the clone close to a drive root when you can.

## Definition of done

A change is done when, on its pull request:

- `node scripts/verify.mjs` passes: one command that runs what CI runs, in the same groups (bootstrap, changelog, generated-tree, node tests, the .NET build and tests; `--fast` for the inner loop, `--no-dotnet`, `--browser`, `--pack`; when CI fails see "When CI fails" in `AGENTS.md`). That is the same as: `node scripts/bootstrap.mjs` has been run (generated files are not in git; see below), and `node --test "core/tests/*.test.mjs" "core/elements/*/*.test.mjs" "core/modules/*/*.test.mjs" "scripts/tests/*.test.mjs"` passes (the last glob checks `blazor/mappings` against the element metas), and `dotnet test PlainKit.slnx` passes.
- **Generated files are not in git.** `node scripts/bootstrap.mjs` (Node only, about 4 seconds) produces them, in this order because each step reads the previous one's output: `node core/tools/build.mjs` (`core/dist`, the element modules, the gallery data), `node scripts/generate-blazor.mjs` (the `Pk*` wrappers in `blazor/src/PlainKit.Blazor/Generated/`), `node scripts/build-skills.mjs` (`core/dist/skills/`, the `plainkit-sdk` and `plainkit-blazor` skills) and `node scripts/publish-dist.mjs` (the package copy of `dist`). Run it after cloning, after switching branches and after editing sources; CI runs it first, and `node scripts/generated.mjs check` fails if a generated file is tracked or the bootstrap changes a tracked one. Only the short workflows in `scripts/skills/<skill>/SKILL.md` are hand-written; `scripts/tests/skills.test.mjs` verifies every code sample against the sources (a sample that names a tag, prop, slot, component or parameter that does not exist fails), so a new workflow or example must use real API only.
- A changelog fragment is added (`node scripts/changelog.mjs new <type> <slug> --issue N`; format in `changelog/README.md`), or the pull request has the label `no-changelog` and says why (a change to docs only needs neither). `CHANGELOG.md` itself is edited only by the release pull request. CI runs `check` and `check-pr`.
- Generated files (`core/dist`, the Blazor `Generated/` and `wwwroot/plainkit`, the skills, `core/elements/*/*.element.js`, `core/elements/elements.css`, the Files snapshot, `gallery.data.js`, `api.current.json`; the exact list is `node scripts/generated.mjs list`) are gitignored: never commit them and never edit them by hand. There is nothing to conflict in them any more. `core/tests/browser/report.json` (the browser attestation), `core/VERSION` and `core/site/scorecard/api.baseline.json` (a release artefact) are not generated and stay committed.
- The skills and docs are updated in the same pull request as the change.
- If the change alters how an element looks (element CSS or templates, layout, tokens, Blazor razor markup), the review screenshots (desktop 1280 and phone 375, light and dark) are attached to the pull request and it is not merged on green CI alone: see "Reviewing what it looks like" below.
- If an element source or a browser case changed, the in-browser suite was re-run so `core/tests/browser/report.json` is current (`node scripts/attest-browser.mjs` does it headless at 1280x900 and prints the counts; by hand: `node core/tools/serve.mjs 5341 --write-reports`, open `/tests/browser/` at desktop size, wait for "report saved"; see "The in-browser element suite" in `core/README.md`).
- After a change to `PlainKit.Blazor.csproj`, pack into a scratch folder and list it: `dotnet pack blazor/src/PlainKit.Blazor -c Release -o <dir>`, then `unzip -l <dir>/*.nupkg`. There must be no `content/` or `contentFiles/` entries (the generator manifest stays out of the package), and the DLL, the XML docs and `staticwebassets/` must be there. `scripts/tests/blazor-package.test.mjs` checks the csproj part.
- SDK and Blazor changes ship together: an element change updates its mapping in `blazor/mappings/<name>.json` (the SDK's element meta knows nothing about Blazor) and, through the bootstrap, its generated wrapper (never edit `Generated/` by hand).
- It uses only components that exist in `core`; a missing component is recorded in the standing "Tracker: components the SDK lacks" issue (#336) instead of being invented locally.
- No internal tracker references, personal paths or real email addresses (`core/tests/privacy.test.mjs` checks).

## Reviewing what it looks like

Numeric checks and green CI did not catch a wrong-looking record header or a breadcrumb chevron inside its link, so a change to how an element looks is also looked at.

- `node scripts/ui-review.mjs` renders the gallery examples of the elements you changed versus `origin/main` (`--elements page-header,breadcrumb`, `--all`) at desktop 1280 and phone 375, in light and dark, into the git-ignored `review-output/`: one PNG per example and a `manifest.json`. It also audits every example (horizontal overflow, clipped or overlapping boxes, tap targets under the touch-target token on the phone, WCAG AA text contrast, focusable elements with no name, decoration drawn inside a link, images or icons with no size) and exits 1 on errors, printing a `FIX:` line for each; warnings are for you to judge (`--strict` fails on them). It needs Chrome or Edge (`PK_CHROME`), like `scripts/attest-browser.mjs`.
- **Scenarios** cover the states a resting example cannot show: `core/tests/review/scenarios/<name>.js` scripts a page or element (open a menu, scroll a body 800px, collapse the rail, hover or focus a control, switch to `dir="rtl"`) with declarative steps, takes screenshots after named steps, and asserts what the state must look like with measuring `expect(t)` helpers (a failed expectation is an error with a `FIX:` line; `t.known(issue, ...)` marks an already filed defect as a warning). `node scripts/ui-review.mjs` also runs the scenarios about the elements you changed; `--scenarios [names]` runs named ones (or all) and `--scenarios-only` skips the gallery examples. A change that fixes a state adds or extends its scenario, and you look at its screenshots (`scenario-<name>__<shot>__<desktop|phone>__<light|dark>.png`); a defect you see becomes an issue, not part of that pull request. The format is documented in `core/tests/review/scenario.js`.
- Attach the screenshots to the pull request (the `UI review` CI job also uploads them as the `ui-review` artifact; it is not required and calls no model). The pull request is not merged on green CI alone: the owner, or the orchestrating agent after looking, checks the screenshots against what the issue expects.
- The `ui-reviewer` project subagent (`.claude/agents/ui-reviewer.md`) can do a first pass: give it a pull request number or the `review-output/` folder and it reads the issue's stated expectations, the screenshots and the manifest, and writes advice for the owner (what matches, what deviates, what a designer would flag, what it could not see). It approves and merges nothing.
- Every layout expectation an issue states ("the chips share the crumbs row", "the actions are full width on a phone") becomes a measuring case in `core/tests/browser/`, so it stays true.

## Building PlainKit.Blazor from a clone

The generated components (`blazor/src/PlainKit.Blazor/Generated/`), the package copy of the toolkit (`wwwroot/plainkit/`) and `Generated/generated.manifest.json` (the list of what is not generated, and why) are not in git. On a fresh clone run `node scripts/bootstrap.mjs` from the repository root (Node only, about 4 seconds) before `dotnet build` or `dotnet test PlainKit.slnx`; without it the build stops with "Generated files are missing: run node scripts/bootstrap.mjs from the repository root". The generator uses the type a mapping names for a JSON prop when the package declares it, and lists a JSON prop that has no type in `generated.manifest.json` (`typesToDefine`). Consumers of the NuGet package are not affected: the package contains everything, and the manifest itself stays out of it (its content reaches them as `references/known-gaps.md` in the skill).

## Versioning and releases

**One version for everything.** The SDK (`core/dist`) and `PlainKit.Blazor` always carry the same version, kept in `core/VERSION` (SemVer 2.0,
for example `0.1.0-alpha.1`). `tools/build.mjs` stamps it into `dist/manifest.json` and `js/version.js` (`PK_VERSION`), MSBuild reads it for the
NuGet package (`PkAssets.Version`), and `node core/tools/versioning.mjs check` (part of CI) fails when any of them disagree.

**What the number means.** Before 1.0 a breaking change bumps the minor version and is listed under a `### Breaking` heading in the changelog; from
1.0 it bumps the major. A new public item is a minor bump; a fix that changes no API is a patch. Pre-releases (`-alpha.N`, `-beta.N`, `-rc.N`)
come before a version. Public API means classes, tokens and JS exports, and each element's tag, props (type, default, values), slots, events, parts,
CSS properties and methods (`core/site/scorecard/api.baseline.json` holds the previous release's; the Blazor mapping is not part of it). Deprecate
before removing: mark it, log a warning through the logger, keep it for one minor version, remove it in the next. Marking is one field in the element's meta,
`"deprecated": { "since": "0.2.0", "remove": "0.3.0", "message": "use tone instead" }`, on the element, a prop, an event or a slot (`remove` at least one minor version after
`since`); the generated module then warns once per page through the logger when the item is used (an attribute or property set, a listener added, a slot filled, the tag connected)
and an element that deprecates nothing pays nothing. `node core/tools/versioning.mjs check` fails when an item the last release announced for removal in a later version is already
gone; `bump` lists announced removals and items due for removal. The removal itself is still a breaking change for the bump (a minor bump while the major is 0), and the release
pull request refreshes the baseline, which also records what was deprecated.

**When.** `main` is always releasable (CI green). Packages are published only when a version tag is pushed, never on a merge. A
release is cut when a batch of finished issues is worth shipping, not on a schedule and not on every merge; nuget.org versions cannot be deleted,
only unlisted, so publish less often rather than more. Pages tracks `main` as "latest"; the pinned releases are the GitHub release (the `dist` zip) and the NuGet package. A tag does not carry `core/dist`, so there is no CDN link by tag.

**How: a release pull request.** Branch `release/X.Y.Z`, then:

1. `node core/tools/versioning.mjs bump` shows what the API changes since the last release need; pick a version that covers them.
2. `node core/tools/versioning.mjs set X.Y.Z` (it changes `core/VERSION` and `core/package.json`; the stamp reaches `dist`, the skills and the package copy through `node scripts/bootstrap.mjs`, which CI and the release workflow run).
3. `node scripts/changelog.mjs compile --version X.Y.Z` (add `--date YYYY-MM-DD` to set the date): it moves the fragments of `changelog/unreleased/` into a new dated section of `CHANGELOG.md`, grouped Breaking, Added, Changed, Fixed, Removed, Notes, leaves an empty "Unreleased" and deletes the fragments. CI fails a release pull request that still has fragments.
4. Last, refresh the API baseline for the release: `node core/tools/api-surface.mjs --write --release X.Y.Z`.
5. CI runs `check --release` and `bump --require` against the base branch's baseline: it fails when the baseline was not refreshed, or when the version does not cover the API changes (a breaking change needs a minor bump while the major is 0, a major bump after).
6. Merge, then tag the merge commit `vX.Y.Z` and push the tag. `release.yml` checks that the tag equals `core/VERSION`, attaches the `dist` zip, its manifest, the `.nupkg` and `plainkit-skills-<version>.zip` (the agent skills) to a GitHub release (marked as a pre-release when the version has a `-`), then publishes `PlainKit.Blazor` to NuGet, and publishes to npm only if `NPM_TOKEN` is set (pre-releases go to the `next` tag). A registry problem never keeps the release assets from being attached; fix it and re-run the failed job.

The tag is pushed by the owner (agents never push tags). Repository settings that support this flow (branch protection, squash-only merges, release-tag protection, the merge queue) are listed with their `gh` commands, not applied, in [.github/REPO-SETTINGS.md](.github/REPO-SETTINGS.md).

Release notes are generated from the merged pull requests, so titles and descriptions should say what changed. See `PUBLISHING.md` for the
one-time setup and how people get a version.
