# Separate packages for the larger components: requirements and design (refs #1656)

Status: proposal for owner decision. Research and design only; no product code, no ceiling change. Owner direction 2026-10-20: carve out separate packages for the bigger
components so the core package stays small; the npm ceilings were raised once (packed 883,500 to 900,000, unpacked 3,282,700 to 3,350,000) as a stopgap. Related: #1644
(page size), #598 (pk-os), #430 canvas, #431 SVG toolkit, #432 dock, #1486 markdown editor; supersedes the 2026-10-11 packaging spec's "no sub-packages now" for the reasons in section 1.

Measured on `origin/main` (498c0539, version 0.19.0) after `npm ci` and `node scripts/bootstrap.mjs`: `npm pack --dry-run --json` in `core/`, gzip of each file in `core/dist`,
import-closure scripts over `core/dist` (static and literal dynamic imports). Sizes are gzip unless a column says raw. "Packed" estimates for a candidate are
its JS gzip + its slice of the generated metadata (`elements/api.json`, `custom-elements.json`, `web-types.json`, the editor files) + half of its skill reference text (the other half is in the Blazor
skill, which the npm package already leaves out); they are estimates (the tarball compresses across files), to be replaced by measured values in each phase.

## 1. Evidence on main

- Tarball: 883,476 packed / 3,271,119 unpacked bytes, 352 files; ceilings 900,000 / 3,350,000 (`core/tests/package-size.test.mjs`). Headroom is 16.5 KB packed.
- **The runtime JS is not what fills the package.** By gzip of each file: element modules (134 files) 239 KB; skills (27 files, SDK skill only) 229 KB; CEM, web-types, `elements.d.ts`, VS Code data 178 KB;
  `dist/js` 152 KB; `elements/api.json` 118 KB; the audit CLI (`dist/tools`) 44 KB; CSS and icons 17 KB; `manifest.json` 16 KB. Metadata plus skills are about 59 percent of the packed bytes and grow
  with every element (average 2.2 KB of metadata and 1.7 KB of skill text per element, against 1.8 KB of JS). **A split that moves only JS saves less than half of what the element costs the tarball**: an extra
  must take its metadata and skill text with it (sections 5 and 7).
- **Already outside the package:** `dist/modules` (the dev tools, 69 KB gzip, 172 KB raw, own manifest and zip), `dist/gallery` (332 KB gzip), `manifest.extras.json` files, the Blazor skill, `api.full.json`. The precedent for a second unit exists
  (`docs/tool-modules.md`: "the two units"; modules import `../../js/*.js`, an import map remaps them when hosted apart).
- **Dead weight in the package today:** 33 files in `dist/js` (109 KB raw, 49 KB gzip) are reachable from no element, `plainkit.js` or `js/app.js` by import analysis (`custom-sdk*`, `layout-*`, `theme-*-logic`,
  `console-logic`, `element-inspector*`, `framework-checks`, `quality`, `scoring`, `zip-store`, `mount-support` ...). Only the dev-tool modules import them, and the modules are not in the npm package. Phase 1 confirms each with an import-graph test before moving it.
- **Loader:** `core/js/loader.js` plans from tag names. In `dist` (`BY_NAME`) a tag `pk-x` imports `./x.js` next to the registry with no registry fetch (#1502); the registry (`dist/elements/registry.js`) is read only to word a failure ("check the spelling"). There is no
  way to point a tag at another package. `core/package.json` has `exports` (`./elements/*`, `./js/*`, `./css`, `./skills/*`, `./dist/*`), `sideEffects` for elements and CSS, and one `files` list with negations.
- **Release:** one version (`core/VERSION`), checked by `core/tools/versioning.mjs` (stamps `core/package.json`, `Directory.Build.props`, manifests; `check --tag`); `release.yml` jobs `verify` (full verify with `--pack --browser`),
  `build` (bootstrap, version/tag check, tests, `dotnet pack`, three zips) and `publish` (GitHub release, `dotnet nuget push --skip-duplicate`, `npm publish --provenance --access public` only when `NPM_TOKEN` is set). One npm package, one NuGet package.
- **Blazor:** `PlainKit.Blazor` ships a byte copy of `core/dist` as static web assets (`wwwroot/plainkit`, 5.4 MB on disk: gallery, skills, modules included), the generated `Pk*` wrappers (from `blazor/mappings/<name>.json`, 133 mappings) and the dev-tool
  components (`PkDevTools`, `PkThemeEditor`, `PkCodeExplorer`, `PkScorecard` ...) that import `plainkit/modules/<tool>/`. `scripts/check-package.mjs` asserts the nupkg's contents; `scripts/tests/blazor-wrapper.test.mjs` and `blazor/handwritten.json` police the hand-written files.
- **API baseline:** `core/tools/api-surface.mjs` lists classes, tokens, JS exports and every element's API in one file (`api.baseline.json`); a removed item needs a minor (while 0.x) bump. Every candidate below is in the 0.19 baseline (pk-dock 33 items, pk-canvas 41, pk-markdown-editor 59).
- **Planned growth** (all unbuilt, each design says "lazy layers, 3 to 6 KB gzip per module, never raise a limit"): canvas layers C2 to C5 (2.8 KB element now), the SVG toolkit (about 10 modules plus an editor and viewer, order of 25 to 40 KB gzip by the 10-19 spec's per-module
  estimates), dock floating layer, layout builder as a route, rich text phases 3 to 6, code explorer growth, pk-os. Without a split these alone consume the stopgap headroom (40 to 60 KB packed with their metadata and skills).

## 2. Goals and non-goals

Goals:

1. A typical app (forms, tables, pages, dialogs, app shell) installs one package whose packed size goes **down** from today and stays flat as extras grow.
2. A rarely needed, large component (canvas, SVG, dock, markdown, dev tools, pk-os later) is its own package, installed on purpose, with its **own metadata, types, CEM, skill text** (on the Blazor side the one package stays, with a declared set of extras, section 6).
3. Nothing is lost: same tags, same props, same events, same gallery and docs on the Pages site; per-element lazy loading is unchanged.
4. One version, one tag, one release: lockstep; a consumer never needs a compatibility matrix.
5. Every package has a size ceiling that only ratchets down, from its first publish. The core ceilings are lowered with each move (section 9).
6. Existing imports keep working for one deprecation window.

Non-goals: a package per element (the 2026-10-11 spec's 129-package matrix); raising any ceiling; a mandatory build step (the no-build path stays: unzip or copy, script tags, optional import map); splitting the CSS page layer or tokens;
independent versions per package; moving the Blazor assembly's core wrappers; third-party vendored code; designing pk-os, the SVG toolkit or the layout builder here (they only get a package to land in).

## 3. Ranked candidates

Ranked by estimated packed bytes, then by how rarely a typical app needs it (Need: 1 every app, 5 almost none; a judgement from the element's role, who imports it, and the issue text). "Excl." means files no core element, page, shell or
`app.js` reaches (import analysis), so they can leave without touching core. All rows are 0.19 measurements; unpacked is raw JS plus 1.3 x raw metadata plus half the raw skill text, rounded.

| # | Candidate | Contents (excl. JS) | JS gz / raw | Metadata + skill gz (est) | Packed est | Unpacked est | Need | Verdict |
| --- | --- | --- | --: | --: | --: | --: | :-: | --- |
| 1 | Tool helpers (no module in npm uses them) | 33 files of `dist/js`: custom-sdk*, layout-*, theme-*, console/log/perf logic, element-inspector*, quality, scoring ... | 48.9 / 109 KB | 0 | 40 to 49 KB | 109 KB | 5 | **Move first** (`@plainkit/tools`, with the modules unit) |
| 2 | Canvas and design surface | `pk-canvas`, `pk-design-surface`, `pk-tray`, `pk-property-grid`, `hotkey.js` | 10.7 / 28 KB | 15.2 | 26 KB | 99 KB | 5 | **Move** (`@plainkit/canvas`); the SVG toolkit and canvas layers (est. +25 to 40 KB) land here |
| 3 | Dock workspace | `pk-dock` + 7 `dock-*.js` | 14.3 / 38 KB | 7.7 | 22 KB | 69 KB | 4 | **Move** (`@plainkit/dock`); floating layer and pk-os base |
| 4 | Field group and lookup picker | `pk-field-group`, `pk-lookup-picker`, `field-conditions.js` (record and list pages use them) | 8.8 / 23 KB | 13.2 | 22 KB | 77 KB | 2 | Stay (the SDK's main use case); revisit |
| 5 | Calendar and date range | `pk-calendar`, `pk-date-range-picker`, `range-logic`, `iso-date` | 7.0 / 18 KB | 7.4 | 14 KB | 52 KB | 3 | Stay for now; candidate in a later wave |
| 6 | Image gallery and lightbox | `pk-image-gallery`, `pk-lightbox` | 5.6 / 15 KB | 6.5 | 12 KB | 44 KB | 4 | Later wave |
| 7 | Markdown editor | `pk-markdown-editor`, `js/markdown/{parse,render,commands}.js` | 7.1 / 18 KB | 4.0 | 11 KB | 39 KB | 4 | **Move** (`@plainkit/markdown`); phase 2, the smallest real element split |
| 8 | Code view and code block | `pk-code-view`, `pk-code-block`, `clipboard.js` | 4.7 / 12 KB | 4.6 | 9 KB | 32 KB | 3 | Stay (docs apps) |
| 9 | Gallery element | `pk-gallery`, `gallery-sections`, `gallery-options` (needs `dist/gallery`, which the package omits) | 3.5 / 8 KB | 3.0 | 6 KB | 22 KB | 5 | Later; today it is a stub in npm that says the gallery is missing |
| 10 | Kanban | `pk-kanban` | 2.4 / 6 KB | 3.0 | 5 KB | 17 KB | 4 | Stay (below the 8 KB rule) |
| 11 | Chart | `pk-chart` | 3.3 / 8 KB | 1.9 | 5 KB | 16 KB | 3 | Stay (dashboards) |
| 12 | Table lazy features | `table-edit` 7.0, `table-cols` 2.8, `table-expand` 1.4, `table-vw` 1.6, links, scope | 14.8 / 34 KB | in table | 15 KB | 34 KB | 2 | Stay: already lazy per use, and tables are core |
| 13 | Dev-tool modules | `dist/modules/*` (theme editor 17.9, code explorer 12.2, scorecard 11.7, layout builder 7.7, devtools, console, logs ...) | 69 / 172 KB | 0 | **0 today** (not in npm) | 0 | 5 | Publish as `@plainkit/tools` with row 1; they weigh on the nupkg, the zips and Pages, not the tarball |
| 14 | Audit CLI | `dist/tools/audit` + `strict` (`bin: plainkit`) | 44 / 124 KB | 0 | 44 KB | 124 KB | 4 | Open question Q5: keep in core (documented `npx plainkit audit`) or `@plainkit/audit` |
| 15 | Icons sprite, page CSS | `icons.svg` 12 KB raw, `plainkit.min.css` 6.9 KB gz | | | 17 KB | 70 KB | 1 | Stay (every page) |

Rule for the table's verdict column: an extra is **at least 8 KB gzip packed (estimate) and Need 4 or 5**, or it is a planned family that would otherwise push the core past its ceiling. Below that, the package overhead (a manifest, a pack check,
a NuGet project) costs more than the bytes. Rows 1, 2, 3 and 7 pass; rows 4 to 6 and 9 are a later wave decided by measured demand, not by this spec.

## 4. Proposed split

Owner direction (2026-10-20): on the npm side **one package per extra** (core, canvas, svg, and so on), each with an explicit declaration of the JS modules a consumer uses; on the Blazor side **one NuGet package**, `PlainKit.Blazor`, where the project declares core plus the extras it wants, or full (section 6). All lockstep (section 8).

| npm package | Takes | Depends on | Blazor option name |
| --- | --- | --- | --- |
| `plainkit` (core) | everything not listed below: tokens, base, all other elements, components, pages, shells, app framework, loader, CSS, icons, the audit CLI (Q5), the SDK skill | none | always on |
| `@plainkit/tools` | the dev-tool modules unit (code explorer, theme editor, scorecard, layout builder, devtools, console, logs, log settings, performance, quality, tool dock) and the 33 helper files | `plainkit` (exact) | `tools` |
| `@plainkit/canvas` | `pk-canvas`, `pk-design-surface`, `pk-tray`, `pk-property-grid`, `hotkey.js`, canvas layers (#430) | `plainkit` (exact) | `canvas` |
| `@plainkit/svg` (planned, #431) | SVG viewer, editor, `svg-*.js` modules | `@plainkit/canvas`, `@plainkit/dock` (exact) | `svg` |
| `@plainkit/dock` | `pk-dock` + 7 `dock-*.js`, floating layer (#432) | `plainkit` (exact) | `dock` |
| `@plainkit/markdown` | `pk-markdown-editor`, `js/markdown/*` (`renderMarkdown`), later rich-text phases | `plainkit` (exact) | `markdown` |
| `@plainkit/os` (later, #598) | pk-os shell | `@plainkit/dock` (exact) | `os` |
| `@plainkit/all` | no files: dependencies on every package above and a `register.js` importing each; "I want everything" | all | `full` |

Names: the `@plainkit` npm scope must be created and owned by the owner (Q1). The unit is one extra, so a consumer's `package.json` is the explicit declaration of which JS modules the app uses (`import '@plainkit/canvas'`), and an extra grows (SVG, layers) without touching the others. Why not
fewer: one `extras` package would put a 70 KB markdown reader behind a 200 KB editor family. Why not one per element: the 129-package matrix of the 2026-10-11 spec; the unit is a family with a size and an audience (rule in section 3), and a small element joins its family (property-grid rides with canvas, Q11).
Each package costs one manifest, one pack check and one publish step (section 8), so the rule of section 3 keeps the count near six.

**Source layout does not move.** Sources stay in `core/{elements,components,pages,shells,modules}/<name>/`; tests, tier rules (C1 to C4), the gallery and the site keep working unchanged. A new field in the element's meta, `"package": "dock"` (absent means core),
and a repository-level `packages.json` (package id, folders and `js/` files it owns, dependency, NuGet id, ceilings) are the single declaration. The build, the version check, `check-package.mjs`, `release.yml` and the size test all read `packages.json`; none hard-codes a package name.
A new tier rule P1 (a node test, like `core/tests/tiers.test.mjs`): code in core may not import a file owned by an extra; an extra may import core and its declared dependency only. The `dist/js` helper files get an owner in `packages.json` by prefix (`dock-*`, `markdown/`, `svg-*`, ...) or by explicit list.

`core/dist` stays the **full overlay tree** (everything, as now; the site, the gallery, Pages, the Blazor `wwwroot/plainkit` copy, the runtime zip and the tests keep reading it). The npm tarballs are **assembled** from it: the build copies each package's files into
`core/dist-packages/<id>/` with a generated `package.json` (gitignored, added to `scripts/generated.mjs`) and `npm pack` runs there. Core's `files` negations would not work: the generated metadata files are single files holding every element, so they are produced once per package, filtered.

## 5. How a consumer loads an extra

Principles: nothing eager; the extra costs a tag-to-URL map until a tag is used; per-element lazy loading stays; the failure when an extra is missing says which package to install.

**Registration.** Each extra ships `register.js` (tiny, side-effect): it calls `registerExtra('@plainkit/dock', { 'pk-dock': './elements/dock.js', ... }, import.meta.url)` from a new `js/extras.js` in core (about 0.3 KB gzip, within the loader's budget). `extras.js` holds a
`Map` tag to absolute URL, derived from the extra's own location. `loadElements` checks the extras map before the by-name path (`./x.js` beside the registry), and `registerExtra` itself re-runs `loadElements(document)` so tags already on the page upgrade whatever
the script order. Nothing in the extras loads until its tag appears (`observeElements` covers later additions as today). A bundler consumer writes `import '@plainkit/dock'` (its `exports` maps `.` to `register.js`); a no-build consumer adds
`<script type="module" src=".../dock/register.js">` after `plainkit.js`; Blazor does it for them (section 6).

**Shared modules stay singletons.** An extra's elements import core helpers (`element.js`, `log.js`, `positioning.js` ...). Two forms, one source:

1. *Overlay form* (relative `../js/x.js`, same layout as core's `dist`): the release zips, the Pages site, Blazor static web assets, the in-repo `dist`. Correct when the extras are unzipped or copied over the core tree, as the modules zip already is ("unzip it into the runtime folder").
2. *npm form* (bare `plainkit/js/x.js`, which core's `exports` `./js/*` already provides): the tarball's text is produced by the build with a mechanical rewrite of the relative core imports (one regex, covered by a test). Bundlers and Node resolve it; a no-build
   consumer that serves `node_modules` adds one import map line, `"plainkit/": "<core dist url>/"`, the same trick `docs/tool-modules.md` documents for hosting the modules apart. `@plainkit/*` packages ship that snippet in their README and `dist/importmap.json`.
A browser case asserts identity: the `Base` class an extra's element extends is the instance core created (`customElements` upgrade works, `log` is one logger), in both forms.

**Missing extra.** `registry.js` (read only on a failed load) gains `export const extras = { 'pk-dock': '@plainkit/dock', ... }` generated from `packages.json`. A `<pk-dock>` with no registered URL logs once:
"<pk-dock> is in @plainkit/dock (not installed or not registered): npm i @plainkit/dock and import it, or add register.js (Blazor: add dock to PlainKitExtras)". The typo message stays for unknown tags. The tag stays inert (as any unknown element), nothing throws.

**Per-package metadata and types.** Each tarball has its own `custom-elements.json`, `web-types.json`, `vscode.html-custom-data.json`, `elements.d.ts`, `elements.vue.d.ts`, `elements/api.json` and `manifest.json` (SRI per file, `requires: plainkit <version>`, as `modules/manifest.json` does).
Core's files list core's elements only. The editors that read `package.json` `customElements`/`web-types` fields pick up each package's file, so tooling sees an extra's elements exactly when it is installed. `elements.d.ts` in an extra augments `HTMLElementTagNameMap`, which merges.
`exports` of an extra: `.` (register), `./elements/*`, `./js/*`, `./custom-elements.json`, `./web-types.json`, `./skills/*`, `./package.json`. `sideEffects` lists `register.js` and the elements.

**Tools package.** Not elements: modules (`mountThemeEditor` and friends). Its exports map `./modules/*`; the core's `loadChunk` is unaffected. Hosting apart keeps working through the existing import-map and `plainkit-runtime` meta tag.

## 6. Blazor: one package, a declared set of extras

One NuGet package, `PlainKit.Blazor`, as today (owner direction: the efficient shape). It keeps every generated `Pk*` wrapper (133 mappings; the wrappers are a few KB of IL and the trimmer drops what a WebAssembly app does not use), so no assembly splits and no namespace changes. What the consumer chooses is
**which JS modules and static web assets follow the app**, and the choice is explicit.

**Declaration.** Two equivalent forms, one source of truth read by build and startup:

- `.csproj`: `<PlainKitExtras>canvas;dock;markdown</PlainKitExtras>` (or `<PlainKitExtras>full</PlainKitExtras>`; absent means core only). MSBuild exposes it to the compiler (`CompilerVisibleProperty`) and writes it to a generated `plainkit.extras.json` static asset, so the browser side reads the same list.
- Code: `services.AddPlainKit(o => o.Extras.Add(PkExtra.Canvas, PkExtra.Dock))` or `o.Extras.AddAll()`. A mismatch with the csproj list (code names an extra the csproj does not) is a startup error, not a merge: one declaration wins, the other must agree. The csproj is the recommended place (it drives the assets); the code form is for tests and hosts that publish without MSBuild assets.

**Static web assets follow the declaration.** The package ships the full tree under `_content/PlainKit.Blazor/plainkit/`, but a `buildTransitive` target (`PlainKit.Blazor.targets`, which already ships) removes the static web asset items of every extra not declared (patterns from a generated
`plainkit.extras.map`: extra to files, from `packages.json`) before the endpoints are built. A published app contains core plus the declared extras only; `dotnet publish` of a core-only app drops the dock, canvas, markdown, tools and gallery/skills assets. The tools unit (`modules/`) is the `tools` extra; `gallery`
and `skills` are never served by default (they are design-time; `<PlainKitExtras>gallery</PlainKitExtras>` opts in for the dev tools that need them).
**JS modules follow the same list.** `PkRuntime.InitAsync` hands the declared list to the bridge, which calls `registerExtra` (section 5) for each from its `_content` URL, so an extra's tags load lazily, one element at a time, only when they appear. Nothing undeclared is registered.

**An undeclared component is never silent.** Every generated wrapper carries `[PkRequiresExtra("dock")]` (from the mapping's `package`). Three layers, from earliest:

1. *Build time:* a Roslyn analyzer shipped in the package (`analyzers/dotnet/cs`) reports `PKB001` (warning by default, error with `<PlainKitStrictExtras>true</PlainKitStrictExtras>`, which the sample and templates set) for any use of a type with `[PkRequiresExtra]` whose extra is not in `PlainKitExtras`, in C# and in Razor markup (`<PkDock>`). The message names the fix: "PkDock needs the 'dock' extra: add dock to <PlainKitExtras> in the project file".
2. *Startup:* `AddPlainKit` validates the csproj list and the code list against the known extras (unknown name: error listing valid names); `PkRuntime.EnsureInitializedAsync` logs the declared set once at Information and, in Development, throws on a declaration the assets do not back (the target removed the files).
3. *Render time:* a wrapper whose extra is undeclared throws `InvalidOperationException` with the same message in Development and logs an Error once per component type (ILogger and the SDK log, so the logs viewer and the dev tools show it) in Production, then renders an inert, visibly marked placeholder (the SDK loader also prints the "is in @plainkit/dock" message of section 5). No path renders a blank component without a diagnostic.

Generator and checks. `scripts/generate-blazor.mjs` reads `package` from the element meta and emits the attribute, `PlainKit.Blazor.targets` additions (the asset removal, the `CompilerVisibleProperty`) and `plainkit.extras.map`. `publish-dist.mjs` stays one copy of `core/dist`. `check-package.mjs` gains: the map covers every file under the extras exactly once; every `Pk*` wrapper of an extra has the attribute; the analyzer is in the nupkg. Tests: a bUnit test per
layer of the diagnostic; an MSBuild integration test (`dotnet publish` of a tiny app per option set, asserting which files exist under `wwwroot/_content`); the Blazor browser harness runs the sample twice, core-only (an undeclared component yields the diagnostic, not a blank) and full. The sample app declares `full`.
`handwritten.json` and the wrapper test are unchanged: no new hand-written wrapper, only the generator and targets grow.

**Payload budget.** A Blazor app's cost is what the host serves: runtime assets (elements, js, CSS, icons) plus the declared extras. `packages.json` gets two numbers (`blazorPayload`), measured by the MSBuild integration test as the gzip bytes of the static web assets of a published app, ratchet-only like the npm ceilings: **core-only** and **full**. Today (before any move) both are the same
runtime tree (about 410 KB gzip of elements, js and CSS) plus the modules unit (69 KB) plus the gallery and skills assets the package serves (gallery 332 KB, skills about 436 KB gzip); the first Blazor phase records exact figures and sets the ceilings to them. Section 9 shows the goal: core-only falls by each moved extra's runtime JS and no extra's growth raises it.

## 7. Skills, docs, gallery when an extra is not installed

- **Skills.** `plainkit-sdk` (in core) keeps the architecture and the core elements; its elements index lists each extra's elements as one line each with the package ("`pk-dock` (`@plainkit/dock`): ..."), so an agent knows what exists and what to install. Each extra ships
  `skills/plainkit-<id>/SKILL.md` plus its element reference (moved out of `elements-layout.md` and friends). An agent that installs the extra gets the skill from `node_modules/@plainkit/<id>/skills/...`; the release skills zip holds all of them. The skills build (`scripts/skills/`) takes an element's section
  from its package; `scripts/build-agent-refs.mjs` links to the Pages URLs for extras not installed. The SDK skill's loading reference (`loading.md`) gets a "Loading an extra" section (section 5).
- **Docs.** `core/README.md` and the Guides gain one page, "Packages", with the table of section 4, the install snippets and the import-map line. `docs/tool-modules.md` becomes the Tools package's README. The Pages site is built from the full tree and shows everything with a "package" badge.
- **Gallery.** The gallery, API pages and scorecard are Pages-only (`dist/gallery` is already outside npm). Each element's page states its package and install line. `<pk-gallery>` keeps its "gallery not present" message. Gallery samples that use an extra render only if the viewer's tree has it; in the repo and on Pages it always does.
  `llms.txt` lists extras with their package. The scorecard's per-element budgets are unchanged; a package ceiling row is added.
- **Dev tools inspector** (`PkMappingInfo`) and `plainkit audit` know a tag's package from `registry.extras`, so the audit says "pk-dock needs @plainkit/dock" instead of "unknown element".

## 8. Versioning and release flow

- **Lockstep, one tag.** `core/VERSION` is the only source. `versioning.mjs set` stamps every `packages.json` entry's `package.json` (generated) and the `peerDependencies` pin; `check` fails when any generated `package.json` or `.csproj` version differs or when an extra's `peerDependencies.plainkit`
  is not exactly the version (not a range: the extras import core internals). `check --release --tag vX.Y.Z` is unchanged (one tag).
- **Releases.** `release.yml` loops over `packages.json`: `verify` runs the full verify including the new per-package pack checks; `build` packs every npm tarball (`npm pack` per `dist-packages/<id>`) and every nupkg (`dotnet pack` per project) into `release-assets`, and the three zips stay (runtime, modules, skills) (the runtime zip is the full overlay,
  so a no-build zip user is unchanged; per-package zips are not added). `publish` pushes the one NuGet package with `--skip-duplicate`, then npm in dependency order (`plainkit` first, then the extras whose dependencies are already out, `@plainkit/all` last; an extra published without its pinned core would be uninstallable for a moment, a core without extras is fine), each guarded by `npm view <id>@<version>` so a rerun skips what is already published. A last step verifies that every package/version in `packages.json` and the nupkg exist on both registries and fails loudly listing the missing ones; the owner reruns the failed job (the publish steps are idempotent). Publishing
  extras is fine), each guarded by `npm view <id>@<version>` so a rerun skips what is already published. A last step verifies that every package/version in `packages.json` exists on both registries and fails loudly listing the missing ones; the owner reruns the failed job (the publish steps are idempotent). Publishing
  stays gated as today (`NPM_TOKEN`, NuGet OIDC); nothing publishes from `main`.
- **Partial failure** is the new risk (nuget.org cannot delete versions): mitigations are the order above, idempotent steps, the end check, exact pins (a mixed set cannot be installed together by accident), and `@plainkit/all` published last, so "all" only exists when everything does.
- **API surface per package.** `api-surface.mjs` stays one run over the whole repository (one baseline file) and records each item's package. A tag that moves between packages is not a surface change (no bump needed); a JS export that leaves a path core used to serve is, unless a shim keeps it (section 10). The baseline gains a `packages` map so
  the release PR shows moves. `versioning.mjs bump` reports the required level once for the set.
- **Changelog.** One `CHANGELOG.md`, one fragment directory; `scripts/changelog.mjs new` gains optional `--package <id>`, rendered as a prefix ("canvas: ...") so each package's README can link to its entries without a second compile step. The release PR template adds the packages table.
- `PUBLISHING.md` and `CONTRIBUTING.md` ("Versioning and releases") gain the package list, the new npm scope setup (Q1) and the trusted-publisher/provenance setup per package.

## 9. Size ceilings and the way down

**Per-package ceilings from day one.** `packages.json` holds `maxPackedBytes` and `maxUnpackedBytes` per package; `core/tests/package-size.test.mjs` becomes a loop over packages (same checks: closed top-level list per package, relative links in `llms.txt` resolve, omitted files stay omitted, plus a new check that the
union of all tarballs covers `core/dist` minus the documented omissions and that no file ships in two). Each package's first ceiling is its measured size plus 1 percent and is lowered, never raised, like the core's; the same rule as AGENTS.md "Size budgets are never raised". The ceilings' rationale stays in the test's header, one line per change.

**Core ceilings go back down with each move**, set to the measured value of that phase's PR plus 0.5 percent. Estimates (to be measured and recorded on the issue per phase; method: pack before and after):

| Phase | Moves out of core | Packed (est) | Unpacked (est) | Core after (packed / unpacked) | New core ceilings (proposed) |
| --- | --- | --: | --: | --: | --: |
| now | | | | 883,476 / 3,271,119 | 900,000 / 3,350,000 (stopgap) |
| 1 tools | 33 helper files; the modules unit becomes `@plainkit/tools` | -40 to -49 KB | -109 KB | about 838,000 / 3,162,000 | 845,000 / 3,175,000 |
| 2 markdown | element, parser, metadata, skill text | -11 KB | -39 KB | about 827,000 / 3,123,000 | 833,000 / 3,135,000 |
| 3 dock | `pk-dock`, 7 `dock-*.js`, metadata, skills | -22 KB | -69 KB | about 805,000 / 3,054,000 | 811,000 / 3,065,000 |
| 4 canvas | canvas, design-surface, tray, property-grid, `hotkey.js`, metadata, skills | -26 KB | -99 KB | about 779,000 / 2,955,000 | 785,000 / 2,970,000 |
| later waves | calendar, image gallery, gallery element (rows 5, 6, 9) if measured demand says so | -32 KB | -118 KB | about 747,000 / 2,837,000 | decided then |

Resulting extras (first ceilings, one per npm package): tools about 49 KB / 140 KB packed/unpacked (helpers plus the 69 KB gzip modules, which are not in npm today and become a new, optional download), canvas about 26 KB / 100 KB, dock about 22 KB / 70 KB, markdown about 11 KB / 40 KB, each plus 1 percent and each lowered, never raised. A growing family (canvas layers, SVG, dock floating, pk-os) sets its package ceiling in the PR that adds it, with the measurement shown; no standing headroom (Q6). The planned families therefore add to the extras' ceilings, not to core's: the core stays near 780 KB packed for good, **about 120 KB below the stopgap ceiling and 100 KB below today**. The gain beyond the estimates
comes from the metadata: each element removed also removes its CEM, web-types, d.ts, api.json and skill lines (the 2.2 KB + 1.7 KB average above).

Blazor payload (section 6): `blazorPayload.coreOnly` falls with every phase by the moved extras' runtime JS and `full` equals core-only plus the extras; both ratchet down only.

Page-weight and per-file budgets (`scoring.data.js`, the 10 KB page CSS, the 22 KB app entry cap) are untouched; the new `extras.js` is counted in the entry graph budget (0.3 KB) and offset in the same PR (#514's rule).

## 10. Backward compatibility

- **Tags, props, events, CSS:** unchanged. Moving a package does not change an element's API.
- **npm deep imports** (`plainkit/elements/dock.js`, `plainkit/js/dock-model.js`): for one deprecation window (at least one minor, `deprecated: { since, remove, message }` as `versioning.mjs` already enforces) core keeps one-line shim modules at the old paths that re-export from the extra by bare specifier and log one deprecation
  (`js/deprecation.js`). With the extra installed they work; without it the import error names the package. They are generated from `packages.json` (not hand-written), are tiny (a few bytes of packed size each), and are removed at `remove` (the shim list is the migration table's shrink schedule). `@plainkit/all` restores the
  old "everything" surface: `npm i plainkit @plainkit/all`.
- **No-build users (script tags, zip):** the runtime zip is the full overlay, unchanged. Anyone on npm-over-CDN adds the extra's `register.js` or its tags stay inert with the message in section 5.
- **Dev-tool helper files** (row 1) are not documented API; they leave without a shim and the changelog has a `breaking` entry (0.x: a minor release, `versioning.mjs bump` computes it). Module users already import `modules/*` from the modules zip or the Blazor package; the Tools package serves the same paths.
- **Blazor:** one package, so no assembly or namespace change and no new reference. The one new requirement is the declaration (`<PlainKitExtras>` or `AddPlainKit(o => o.Extras...)`): an app that uses `PkDock` without declaring `dock` gets the build warning PKB001, the startup/render diagnostic of section 6, never a blank component. To make the first release safe the default for one minor is `full` when no declaration exists and the project already uses extras (the target logs "PlainKitExtras not set: serving all extras (deprecated default); declare the extras you use"); from the next minor the default is core only. It ships with a `breaking`/`changed` changelog entry, the Blazor skill and README table, and the sample declaring `full`.
- **Skills and docs links** that named an element's reference file keep resolving through redirects (the Pages site) and stub files in `elements-layout.md` pointing to the extra for one window.

## 11. Testing and CI impact

- `scripts/verify.mjs` groups: `lint`, `node`, `dotnet`, `pack` stay; `pack` runs per package (the `CHECKS` table gains rows generated from `packages.json`, with FIX lines); `--changed` maps `core/{elements,components,pages,shells,modules}/<name>/` to its package (reads `meta.json` `package`) so a dock change runs the dock pack check
  and the element tests, not the whole tarball set. A file the mapper does not know still falls back to the full node job. Docs-only and test-only changes are unaffected.
- New tests: `packages.test.mjs` (every dist file owned by exactly one package; P1 import rule; extras' `peerDependencies` exact; shim list equals the deprecated list; registry `extras` equals `packages.json`), the npm-form rewrite test, a per-package `generated.mjs` listing, the generalised `package-size` loop, `check-package.mjs` per nupkg, and
  `scripts/pack-smoke.mjs` (nightly and release): packs everything, installs the tarballs into a temp project with the repo's esbuild as the bundler, loads a page that uses one core and one extra tag in headless Chrome, and asserts the extra's element upgrades with the singleton identity of section 5; then the same with the extra absent and the message logged.
- Browser suite and UI review: unchanged, they serve the full overlay tree. Scenarios for moved elements stay where they are. The Blazor browser harness runs the sample core-only and full, and `dotnet publish` integration tests assert which assets each declaration serves (phase 4).
- Nightly and release (`full-ci`, `release/*`, the tag): run `--pack` for all packages. Ordinary PRs: targeted checks as today, plus the pack check of the package the change touches.
- `needs-bootstrap`: `core/dist-packages` is generated by the bootstrap (after `build.mjs`), adding about 2 seconds; `generated.mjs check` covers it.

## 12. Risks

Dependency-graph surprises (core code reaching into a moved file; the import-graph and P1 tests find them before any move); two import forms drifting (one generator, one rewrite test); duplicate module instances when an extra resolves a different core copy (identity browser case, exact peer pin,
a runtime version check in `registerExtra` that compares the extra's stamped version with core's `version.js` and warns once, reusing the Blazor mismatch warning's wording); publish partial failure (section 8); NuGet cannot unpublish (order, idempotence, `.All` last); more moving parts for contributors (one `packages.json`, scripts read it, the PR flow is unchanged); metadata filtering
bugs (extras' CEM missing a tag: a test compares the union of all CEMs to the old single file until it is retired); documentation sprawl (one Packages page, README tables generated from `packages.json`); `@plainkit` scope not obtainable (fallback: unscoped `plainkit-dock`, a rename in one file); users who tolerate 900 KB and want one install (`@plainkit/all`); an extra
that other extras start depending on (P1 limits dependencies to the declared ones; `svg` -> `canvas`, `dock` -> core); the Blazor hand-written files that mix tool and core concerns (phase 1 measures it first).

## 13. Phased plan (each step leaves main releasable, about 400 lines or fewer of hand-written source; generated files do not count)

0. **Declare, do not move** (docs and tools only). `packages.json` with core owning everything and the extras empty; `meta.json` `package` field in the meta schema; `packages.test.mjs` (ownership, P1) and the per-package size loop with one entry (core, current ceilings). `generated.mjs` knows `dist-packages`. No behaviour change.
1. **`@plainkit/tools`: the mechanism with no loader change.** Assemble `dist-packages/{plainkit,tools}` (the metadata filter, the `files` assembly, `package.json` generation, versioning stamps, `check` and the release loop for two packages), move the 33 helper files and publish the modules unit to npm. Lower the core ceilings to the measured value.
   Smallest real split because modules are already a separate unit with their own manifest and an import-map story; this proves assembly, versioning, release.yml, check-package, the size loop and the shims, while the risky part (the element loader) waits. Blazor (1b, a separate PR): the `PlainKitExtras` declaration, `plainkit.extras.map`, the asset-removal target and the diagnostics for `tools`, which also proves the Blazor option model on the least risky extra; the `blazorPayload` figures are recorded here.
2. **`@plainkit/markdown`: the first element extra.** `js/extras.js` and `registerExtra`, `register.js`, the missing-extra message and `registry.extras`, the npm-form rewrite, per-package metadata and skill filtering, the identity case, `pack-smoke`. Move `pk-markdown-editor` and `js/markdown/*`; shims at the old paths; core ceilings lowered again. Blazor: `[PkRequiresExtra]` on the wrapper, the analyzer PKB001 and the render-time diagnostic (2b).
3. **`@plainkit/dock`** (smaller than canvas, and the base of `svg` and `os`): `pk-dock` with its `js/` files, shims, docs and skills, core ceilings lowered; 3b canvas, design-surface, tray, property-grid as **`@plainkit/canvas`**. From here #430, #431, #432 land in their packages.
4. **Sample, `@plainkit/all`, docs.** The sample app declares `full`, the Blazor browser harness also runs it core-only; `@plainkit/all`; the Packages guide page; `PUBLISHING.md`; the default flip of section 10 one minor later. (Merge into 2 and 3 where the PR size allows.)
5. **Release.** Owner decision on the release that carries the first break (Q4); the changelog `breaking` entries compiled; the first publish of the new packages (a release PR, a tag, as always).
6. Later waves (rows 5, 6, 9, the audit CLI) and `@plainkit/os` (#598): each its own issue and design; the mechanism is already there, so a wave is a `packages.json` edit plus the move.

Every step: changelog fragment (`node scripts/changelog.mjs new changed ...`), docs and skills updated, `node scripts/verify.mjs --changed`, `--pack` for the touched packages, the Blazor tests for Blazor steps, and the 400-line rule (the assembly script is the biggest piece of phase 1; split it if needed). Visual steps do not exist in this plan (no markup or CSS changes); a screenshot review is needed only where a page shows a package badge.

## 14. Open questions for the owner (recommended answer)

1. **npm scope and names.** Create the `@plainkit` npm organisation and publish one package per extra (`@plainkit/tools`, `canvas`, `dock`, `markdown`, later `svg`, `os`) and `@plainkit/all`? (Yes; if the scope cannot be had, `plainkit-tools`, `plainkit-canvas` ... unscoped.)
2. **Order and count.** Tools, markdown, dock, canvas, in that order, or start with one? (That order; phase 1 alone lowers the core by about 45 KB and proves the mechanism; svg and os only when their issues are built.)
3. **Publish the dev-tool modules to npm as `@plainkit/tools`?** They are a zip and Pages-only today. (Yes: it is the only way the 33 helper files can leave core without orphaning the modules, and it gives npm users the theme editor and scorecard.)
4. **Which release carries the break?** npm deep imports move (shims for one minor); Blazor needs the declaration. (Next minor, 0.20, announced in the changelog; npm shims and the Blazor "no declaration means full" default end in 0.22 unless you extend them.)
5. **The audit CLI (`plainkit` bin, 44 KB gzip, 124 KB raw):** keep in core or `@plainkit/audit`? (Keep for now: `npx plainkit audit` is documented in the Blazor skill and the CLI is why `bin` exists; move in a later wave with a `plainkit-audit` bin and a core stub that prints the install line.)
6. **Per-package ceilings:** first value measured plus 1 percent, ratcheting down only; a growing package (canvas, dock, later svg) given room once before its first family PR (an exception to "one-way", needs your approval) or ratcheted per PR as today? (Per PR as today: each PR that adds a family sets its new ceiling in the same PR with the measurement shown; no standing headroom.)
7. **One changelog or one per package?** (One, with a package prefix; five changelogs would triple release-PR work for no reader.)
8. **Deprecation window.** One minor (0.20 to 0.21 removal in 0.22), or until 1.0? (One minor; pre-1.0 and the whole set installs with `@plainkit/all`.)
9. **Source layout.** Keep sources in `core/` with `meta.json` `package` and a `packages.json` (recommended: no test, tier rule or gallery path changes), or move extras to `packages/<id>/`? (Keep.)
10. **Extras version-locked by exact peer dependency** (no ranges, no independent versions)? (Yes: they import core internals; independent versions would need an internal API contract the SDK does not have and does not want before 1.0.)
11. **Rule for the later wave and small elements:** an extra is at least 8 KB gzip packed and Need 4 to 5, decided by measured demand; small elements join a family (property-grid and tray ride with `canvas`; should property-grid be its own package because `svg` and dock panels use it? Recommended: no, `svg` already depends on `canvas`). Calendar, image gallery and the gallery element wait.
12. **pk-os (#598):** its own package `@plainkit/os` on `@plainkit/dock` once the dock floating layer exists, never in core, option name `os` in Blazor? (Yes.)
13. **Blazor declaration form.** `<PlainKitExtras>` in the csproj (drives assets, analyzer and startup) with `AddPlainKit(o => o.Extras...)` required to agree, or code only? (Both, csproj authoritative; code-only cannot trim assets.)
14. **Blazor default with no declaration.** Core only (clean, but breaks apps that use moved components, with the diagnostics above) or `full` for one minor with a deprecation message? (`full` for one minor, then core only.)
15. **Strictness.** PKB001 a warning by default and an error in the sample and templates, or an error always? (Warning by default for one minor, then an error.)
16. **Blazor payload budgets.** Two ratcheting numbers, `core-only` and `full`, measured from a published sample by the integration test, and gallery/skills assets not served unless opted in? (Yes; the first Blazor phase records the figures and sets them.)
17. **One NuGet package forever, or a split if the nupkg size becomes a problem?** (One: the declaration trims what the app serves; the nupkg download is a one-time restore cost. Revisit only if the nupkg passes a size the owner names.)
