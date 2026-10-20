# Publishing

Plainkit has no build step for its users and no runtime dependencies, so "publishing" means putting `core/dist` where people can reach it. `core/dist` is
generated and **not in git** (see "What is in git, and what CI builds" below): every workflow here runs `node scripts/bootstrap.mjs` first. Each way in is a
workflow in `.github/workflows/`.

What a version number means, and how a release is cut (a release pull request, then a tag that equals `core/VERSION`), is in
[CONTRIBUTING.md](CONTRIBUTING.md#versioning-and-releases).

**Packages are published only when a version tag is pushed.** Merging to `main` never publishes to NuGet or npm, and CI (`ci.yml`) may build and
pack to verify but never pushes. The tag must equal `core/VERSION` (`release.yml` refuses otherwise) and is pushed by the owner after the release
pull request merged. Pages is not a package: it redeploys on every push to `main` ("latest"), and the CI artifacts (the `dist` zip, the manifest, the `.nupkg`, the skills zip) are attached to the GitHub release of that tag. The agent skills are also a page of the Pages site (`skills/`).
nuget.org versions cannot be deleted, only unlisted, so a release is cut when a batch is worth it, not on a schedule.

| What | Workflow | Runs on | Where it goes |
|---|---|---|---|
| The gallery and tools site, and `dist/` as a URL prefix (always the latest `main`) | `pages.yml` | every push to `main` | `https://skulmunkie.github.io/plainkit/` |
| `PlainKit.Blazor` (NuGet), a GitHub release carrying `dist` zipped, its integrity manifest, the `.nupkg` and `plainkit-skills-<version>.zip` (the agent skills) | `release.yml` | a tag such as `v0.1.0` | GitHub Releases first, then nuget.org |
| `plainkit` on npm (optional) | `release.yml` | a tag, only when the secret `NPM_TOKEN` exists | npmjs.com |
| Bootstrap, tests, and the "bootstrap leaves the tree clean" check | `ci.yml` | every push and pull request | (checks only) |

## How people get the SDK

| Way | Version | Notes |
|---|---|---|
| Link from the Pages site: `https://skulmunkie.github.io/plainkit/dist/plainkit.min.css` (modules, elements and the gallery sit next to it) | latest `main` | Pages serves one deployment, so it is "latest", not pinned |
| Download `plainkit-dist-<version>.zip` from the GitHub release and copy it anywhere | pinned | the runtime SDK; `manifest.json` (attached too) lists every file with an SRI hash |
| Or take only what you use (**core + modules**, packages.json, #1656): `plainkit-<version>.zip` (core) plus `plainkit.tools-<version>.zip` (the dev tools: the modules and the helper files only they import) and, for the canvas, `plainkit.canvas-<version>.zip` (`pk-canvas`, its viewport and logic helpers and the SVG toolkit `js/svg/`; core alone has no `<pk-canvas>`); unzip the tools zip over the core folder, or load it from the Pages folder `packages/plainkit.tools/` (or `packages/plainkit.canvas/`; core is `dist/`). `plainkit.audit-<version>.zip` is the conformance audit CLI (`audit.mjs`, `tools/audit/`, `tools/strict/`; plain Node, no core code at run time): unzip it anywhere and run `node audit.mjs <path>`, or take the Pages folder `packages/plainkit.audit/`; the tools zip requires it (js/quality.js imports its literal scanner). Each zip has its own `<id>.manifest.json` (SRI hashes, `requires` core at the exact version), attached to the release as `<id>-manifest-<version>.json`. `plainkit-dist-<version>.zip` stays the **full** shape, first class: everything in one download, every path unchanged | pinned | `node scripts/build-packages.mjs --zips <dir>` builds the zips locally and `node scripts/check-package.mjs --zips <dir>` checks them (what `release.yml` runs); nothing goes to npm |
| Download `plainkit-modules-<version>.zip` too when you want the dev tools (theme editor, logs, dock, ...) | pinned | its own unit, `modules/` at the top of the zip: unzip it into the runtime folder so it lands at `dist/modules/`; `dist/modules/manifest.json` (attached as `plainkit-modules-manifest-<version>.json`) lists its files with SRI hashes |
| `dotnet add package PlainKit.Blazor` | pinned | the package carries `dist` (the runtime, and the modules under `dist/modules/`, which the dock, theme editor and log viewer wrappers use) as static web assets |
| `npm install plainkit` | pinned | the runtime only (`dist` without `dist/modules`; the tools are the modules zip or the NuGet package, which need the layout the zip has); only if an npm token is configured (below). Bundlers import through the `exports` map (`plainkit`, `plainkit/elements/<name>`, `plainkit/css`, `plainkit/skills/*`); `plainkit/dist/*` stays mapped for one release; `sideEffects` names the element modules and CSS because each element registers itself on import |

The tag does not carry `core/dist` (it is generated, not committed), so there is no CDN link by tag and none is advertised. Pinned versions are the GitHub release zip and the NuGet package; the Pages site is the latest `main`. (A CDN over the npm package may come later.)

## How people get the agent skills

How to install them for an agent and what to tell it (a snippet for `CLAUDE.md` or `AGENTS.md`) is in the README, section "Using the skills with an agent".

`plainkit-skills-<version>.zip` on the GitHub release holds the skill folders (`plainkit-sdk/`, `plainkit-blazor/`); unzip them into `.claude/skills/` (Claude Code) or read the markdown under `references/` with any agent. The same files are their own page on the Pages site, `https://skulmunkie.github.io/plainkit/skills/` (`index.html` lists each skill, its files and an instruction an agent can follow; `manifest.json` has every file with its size and SHA-256 hash). **They are not packaged**: not in `core/dist`, the npm package, `plainkit-dist-<version>.zip` or the NuGet package (owner decision, #1656): consumers and their agents are pointed at the page. They are generated into `dist-skills/` by `scripts/build-skills.mjs` from the element API, the Blazor mappings and the sample folders, copied to the Pages output by `scripts/build-pages.mjs` (`scripts/skills-site.mjs`) and zipped by `release.yml`; they carry `core/VERSION`; there is no separate version or workflow. (`dist/llms.txt`, `dist/AGENTS.md` and `dist/llms-full.txt` are the same text as single files; `llms.txt` links the skill files at their Pages URLs.)

## What is in git, and what CI builds

In git: the sources (`core/{elements,components,pages,shells}/*/*.{html,css,js,meta.json}`, `core/js`, `core/base`, `core/tokens`, `core/modules`, samples and layouts, `blazor/mappings`, the hand-written C# and Razor, `scripts/skills`), the tests, the docs, `core/VERSION`, and the release artefacts `core/site/scorecard/api.baseline.json` (written by `api-surface.mjs --write --release` in a release pull request) and `core/tests/browser/report.json` (the browser attestation).

Not in git (ignored), produced by `node scripts/bootstrap.mjs`; the list is `node scripts/generated.mjs list`: `core/dist/**` (including `manifest.json`), `dist-skills/` (the agent skills, not part of `dist`), `core/plainkit.css`, the element modules (`core/{elements,components,pages,shells}/*/*.element.js`, `elements.css`, `registry.js`), `core/js/version.js`, the gallery data and the Files snapshot, `core/site/scorecard/api.current.json`, the Blazor `Generated/` folder and `wwwroot/PlainKit.Blazor.lib.module.js`, and `wwwroot/plainkit/` (a copy of `dist`).

Every workflow builds what it needs: `ci.yml` bootstraps, tests and checks that the tree is clean; `pages.yml` bootstraps and then builds the site; `release.yml` bootstraps, tests, packs the NuGet package (its static web assets are the bootstrap output), zips `dist` and the skills, and publishes to npm (`files: ["dist"]` in `core/package.json` is satisfied because `dist` exists on the runner; ignoring `dist` in the repository does not exclude it from the npm package).

## One-time setup: GitHub Pages

1. Repository **Settings > Pages > Build and deployment > Source: GitHub Actions**.
2. Push to `main`. `pages.yml` builds `_site/` with `node scripts/build-pages.mjs` and deploys it.

Every page uses relative paths, so the site works under `/plainkit/` and under any other prefix. To check a build locally:
`node scripts/build-pages.mjs _site`, then serve `_site` under a path (a static server that mounts it at `/plainkit/`).

## One-time setup: NuGet (Trusted Publishing, no API key)

NuGet.org issues a one-hour key to a workflow it trusts, so no key is stored in GitHub.

1. On nuget.org: your username > **Trusted Publishing** > add a policy:
   - **Repository Owner:** `skulmunkie`
   - **Repository:** `plainkit`
   - **Workflow File:** `release.yml` (the file name only, no path)
   - **Environment:** leave empty (this workflow does not use one)
   - **Scopes:** **Push new packages and package versions**. The first release creates the package id, and without this scope the push is refused with a 403 ("does not have permission to access the specified package") even though the login step succeeds.
   - **Policy owner:** you, or an organisation you belong to. A policy covers the packages that owner publishes; scope it to `PlainKit.*` if the form offers a package pattern, and allow publishing new packages so the first release can create the package id.
2. In the GitHub repository: **Settings > Secrets and variables > Actions**, add `NUGET_USER` = your nuget.org **username** (profile name, not your email).
3. Tag a release: `git tag v0.1.0 && git push origin v0.1.0`.

A private repository's policy is only temporarily active (7 days) until the first successful publish; a public repository is fine.

## Optional: npm

Not needed for Pages, releases or NuGet. To also publish `plainkit` to npm, add the repository secret `NPM_TOKEN` (an npm
automation token). The step in `release.yml` runs only when that secret exists, so there is nothing to change in the workflow to turn it
on or off. It publishes `core/` with provenance.

## Before making changes public

The repository is public. Keep it clean:

- `core/tests/privacy.test.mjs` fails on internal tracker references, personal absolute paths, real-looking email addresses and stale licence text; it scans the generated `dist` and the Files snapshot too.
- `.claude/` is Claude Code local state and is git-ignored; do not commit it.
- Package metadata (`Directory.Build.props`, `core/package.json`) names `github.com/skulmunkie/plainkit` as the owner and URL.
