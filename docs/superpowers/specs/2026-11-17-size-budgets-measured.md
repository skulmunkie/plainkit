# Size budgets, measured: where the bytes are and which carve-outs are safe (#1985, step 1)

Status: measurement and recommendation, no product code changes. Date: 2026-11-17. Tree: `origin/integration/queue-56` at `40a9fee0`, after `node scripts/bootstrap.mjs`.
No ceiling, ledger limit or test was edited; resetting the core baseline stays an owner step.

## 1. Commands used

```
node scripts/bootstrap.mjs
node scripts/set-ceilings.mjs --measure --out <scratch>/m.json     # measure only, never --from
cd core && npm pack --dry-run --json                                # the npm tarball package-size.test.mjs checks
node --test core/tests/app-budgets.test.mjs core/tests/budgets.test.mjs core/tests/budget-ledger.test.mjs core/tests/page-weight.test.mjs core/tests/package-size.test.mjs   # 27 of 27 pass
```

Per-element and per-file gzip: `zlib.gzipSync(file, level 9)` over `core/dist`. Dead-code scan: a script that lists every `export` in `core/js/**` and greps all
tracked source, tests and generated files for a use outside the file (evidence in section 5).

## 2. Measured numbers against their limits

Headroom is limit minus measure.

### Core npm package (what `package-size.test.mjs` enforces)

| Budget | Measured | Limit | Headroom |
|---|---|---|---|
| core packed (`npm pack`) | 286,737 | 291,492 | 4,755 (1.6 %) |
| core unpacked | 957,382 | 957,700 | **318 B (the binding limit)** |

The `zip` / `unpacked` pair in the `--measure` output for `plainkit` (1,902,667 / 6,118,251) is the whole built core folder with its manifest, not the npm tarball; only optional-package rows of that output are comparable to `packages.json`.

Largest tarball entries: `dist/plainkit.css` 31,182; `dist/manifest.json` 28,678; `dist/plainkit.min.css` 25,418; `dist/js/table-edit.js` 18,528; `README.md` 17,587; `dist/llms.txt` 16,128; `dist/icons.svg` 12,628.

### Optional packages (`--measure`, bytes)

| Package | zip | zip ceiling | spare | unpacked | unpacked ceiling | spare |
|---|---|---|---|---|---|---|
| plainkit.tools | 271,893 | 272,110 | 217 | 840,428 | 847,783 | 7,355 |
| plainkit.ide | 200,321 | 202,099 | 1,778 | 949,676 | 952,800 | 3,124 |
| plainkit.canvas | 46,041 | 46,502 | 461 | 114,736 | 115,884 | 1,148 |
| plainkit.audit | 52,504 | 53,500 | 996 | 132,205 | 137,500 | 5,295 |
| plainkit.dock | 22,809 | 23,038 | 229 | 59,458 | 60,053 | 595 |
| plainkit.markdown | 13,044 | 13,174 | 130 | 33,286 | 33,619 | 333 |
| plainkit.blazor | 1,925 | 2,120 | 195 | 3,307 | 3,640 | 333 |

### Page weight (the first-load hard gate; gzip / brotli bytes, requests)

| Page | Measured | Ceiling | Spare |
|---|---|---|---|
| button | 18,035 / 15,597, 12 req | 18,100 / 15,600, 12 | 65 / **3** |
| form | 28,130 / 24,396, 16 req | 28,200 / 24,400, 16 | 70 / **4** |
| table | 20,056 / 17,493, 12 req | 20,100 / 17,500, 12 | 44 / **7** |

### Other hard gates and sub-limits

| Budget | Measured | Limit | Spare |
|---|---|---|---|
| page layer `plainkit.css` gzip | 7,391 (min: 6,869) | 10,240 | 2,849 |
| app entry graph (comments stripped) | 21.99 KB, 21 files | 22 KB hard cap | about 10 B |
| largest app page-type chunk | 1.38 KB | 3 KB | 1.62 KB |
| base runtime `element.js` + `element-core.js` (raw gzip, comments kept) | 1,853 + 616 | 2.8 KB | passes |
| Blazor payload coreOnly (gzip) | 727,065 | 745,062 | 17,997 |
| Blazor payload full (gzip) | 1,075,571 | 1,084,709 | 9,138 |

The app entry is at its hard cap to within about 10 bytes: any carve-out that touches `js/app/*` must cut at least as much as it adds.

### The 15 elements nearest the 4 KB limit (gzip level 9; 4 KB taken as 4,096 B)

| # | Element file | gzip B | Spare to 4,096 |
|---|---|---|---|
| 1 | data-table | 4,092 | 4 |
| 2 | markdown-editor (override 4.12 KB = 4,219) | 4,090 | 129 to its override |
| 3 | page-header | 4,087 | 9 |
| 4 | input | 4,086 | 10 |
| 5 | table | 4,054 | 42 |
| 6 | heat-map | 3,959 | 137 |
| 7 | field-group | 3,941 | 155 |
| 8 | combobox | 3,901 | 195 |
| 9 | canvas | 3,830 | 266 |
| 10 | doc-page | 3,796 | 300 |
| 11 | record-page | 3,783 | 313 |
| 12 | lookup-picker | 3,747 | 349 |
| 13 | dock (override 3.65 KB = 3,738) | 3,660 | 78 to its override |
| 14 | app-bar-search | 3,515 | 581 |
| 15 | calendar | 3,391 | 705 |

140 element files in all. Four are within 10 B of the rule (data-table, page-header, input) or within 42 B (table); this is the pressure the review described, and
`page-header` is a newcomer to the list that the review did not name.

## 3. Findings that change the plan

1. **`table-edit.js` is already lazy.** `core/elements/table/table.js:64` loads it with `import()` when `editable` is set, and `core/tests/bundle-page.test.mjs:54-55` already asserts it is a lazy file and not in the initial graph. PR 4 of the issue plan ("table-edit out of the first-load graph") therefore wins **0 bytes of page weight**. Its only win is package size (18,528 B raw, 7,028 B gzip) if the file moves to an optional package, which is a feature-availability decision (an `editable` table in core without the package needs a defined failure), not a hygiene step. `table-cols.js` (6,139 B raw, 2,759 gzip), `table-expand`, `table-scope`, `table-shed` are lazy the same way.
2. **The binding core limit is unpacked, with 318 B spare**, not packed (4,755 B spare). A packed-only saving (compressible text) helps less than its size suggests; bytes that are incompressible or removed whole help both.
3. **The 4 elements named for the IDE move total 27,450 B raw / 10,681 B gzip** (design-surface 7,213 / 2,662; property-grid 6,184 / 2,561; code-view 6,732 / 2,648; command-palette 7,321 / 2,810). They are not in any page-weight graph, so the win is package size only. But core still references them: `modules/layout-builder`, `modules/code-explorer`, `pages/print-page` (property-grid), `pages/tool-page` meta and `js/roving.js`, `js/listbox.js`, `js/shortcuts.js`, `js/palette-logic.js` (command-palette), and `samples/templates/overlays-nav`. Those references must move or be listed before the #1656 import test (core imports nothing from an optional package) passes.
4. **Dropping the unminified `plainkit.css` (31,182 B raw, about 7.4 KB gzip) is blocked by the Custom SDK**, as the revert of #1990 (#1993) found. `core/js/custom-sdk-logic.js` treats `plainkit.css` as the canonical page file (`files.get('plainkit.css')`, line 74) and rewrites both `plainkit.css` and `plainkit.min.css` (`pageCss`, line 56; `custom-sdk-breakpoints.js` reads and rewrites the `--pk-bp-*` block). Making it read the minified file alone needs a case that proves the rewrite of the `--pk-bp-*` block works on minified text (one line, no whitespace) and the theme bake keeps working. See PR 1 below.
5. **`compat-warn.js` has no product importer** (only its own doc comment, tests and a guide): it is an opt-in debug aid a consumer imports from `./plainkit/js/compat-warn.js`. 8,509 B raw / 3,155 gzip. Moving it is a consumer-facing path change.
6. **Dead code is small.** See section 5.

## 4. Ranked carve-out candidates

Savings are measured byte counts of the files concerned (packed is gzip; unpacked is raw), not guesses at a rebuilt size. "Owner" means it needs an owner decision beyond the 2026-11-12 decisions.

| Rank | Candidate | Saves (unpacked / packed) | Page weight | Risk | Guarded by | Owner? |
|---|---|---|---|---|---|---|
| 1 | Unminified `plainkit.css` out of the tarball, `./plainkit.css` export to the minified file (decision 5), after the Custom SDK reads the minified file | 31,182 B raw / about 7.4 KB gzip (as the 957,700 limit: 32 KB freed vs 318 B spare) | none | medium: the Custom SDK, theme editor tab, consumers who read the file | `core/tests/custom-sdk-logic.test.mjs`, `package-size.test.mjs`, `check-package.mjs`, the theme editor browser case | no (decision 5), but the SDK rewrite needs its own measuring case first |
| 2 | Builder elements (design-surface, property-grid, code-view, command-palette) to plainkit.ide or tools (decision 3) | 27,450 B raw / 10,681 B gzip | none | high: core references listed in finding 3, Blazor wrappers move, breaking for core importers, its own minor | `scripts/tests/packages.test.mjs` (#1656 import graph), `core/tests/tiers.test.mjs`, `blazor` mappings test, browser cases `cases-design-surface`, `cases-tools`, `cases-data-display` | no (decision 3), but print-page and tool-page dependencies need an owner call or a stand-in-free redesign |
| 3 | `table-edit.js` to an optional package | 18,528 B raw / 7,028 B gzip | none (already lazy) | medium: `editable` tables in core need a clear "package missing" behaviour | `bundle-page.test.mjs`, `table.test.mjs` editing cases, scenarios `table-edit*` | yes (a feature leaves core) |
| 4 | `compat-warn.js` to tools or a dev entry | 8,509 B raw / 3,155 B gzip | none | low-medium: a documented consumer import path changes | `core/tests/compat-warn.test.mjs`, packages import test | yes (consumer-visible path) |
| 5 | Lazy chunk for `input` (4,086 B, 10 B spare) | about 0.5 to 1.2 KB gzip estimated, off the form page graph; measure per PR | form page | medium: an ordering test, one request on use | form page-weight test, input browser cases | no |
| 6 | Lazy chunks for `field-group`, `table` | same estimate, bench per PR | form, table | medium | page-weight, element browser cases | no |
| 7 | Dead exports (section 5) | under 1 KB gzip in total, mostly constants and test-only helpers | none | low per item | existing tests | no |
| 8 | `README.md` / `llms.txt` / manifest trims | 17.6 / 16.1 / 28.7 KB raw | none | judged unsafe by the owner (issue comment) | n/a | already decided: do not touch |

Nothing in this list lowers a page-weight number except the lazy chunks (5, 6); the first four are install-size only. That matters because the page-weight ceilings (3 to 7 B of brotli) are what block feature work, and those are only moved by shrinking what a page loads or by a feature chunk that the three reference pages do not load.

## 5. Dead-code scan (evidence)

Script over all tracked `.js .mjs .json .html .md .cs .razor` files (excluding `node_modules`, `dist`, `wwwroot`, snapshots, `api.*.json`, generated gallery data), against the `export`s of every `core/js/**/*.js`:

- 106 findings in total.
- **9 "unreferenced files" are false positives**: `core/js/app/pages/{doc,not-found,note,print,tool}.js` and `svc-{dialogs,mount-page,search,tasks}.js` are loaded by `import(`./pages/${id}.js`)` (`core/js/app/module.js:112`) and the service chunk list (`module.js:116`). The scan cannot see a computed path, so none of these may be removed on this evidence.
- 97 exports have no use outside their file in production code. About 60 are used by a test, so they are test seams (constants such as `MAX_*`, helpers such as `toggleBold`, `backoffDelay`) and are not dead. About 33 have no use anywhere outside their file (for example `dock-drag.js` `paintFloat`, `clearDropZone`; `dock-flyout.js` `closeFlyout`; `markdown/commands.js` `toggleList`, `toggleWrap`, `toggleLinePrefix`; `markdown/parse.js` `parseInline`; `markdown/render.js` `renderAst`; `page-context.js` `nestUnder`; `page-fields.js` `hintTip`; `route-focus.js` `findHeading`; `share-link.js` `hasCompression`; `svg/matrix.js` `skewY`, `determinant`). Most of these are probably used inside their own file, so removing the `export` keyword saves nothing; deleting an unused function saves its body. The scan did not separate the two (the full list is in the review's scratch output and is easy to regenerate with the method above).
- Estimate: a few hundred bytes gzip across core, in files that are mostly in optional packages already (dock, markdown, svg, tools modules). It is not a lever for the core ceiling or for page weight. Recommend a clean-up PR only if it falls out of other work.

## 6. Recommended next three pull requests

Each about 400 lines or less and leaves `main` releasable. Check commands run after the last edit with `--base origin/integration/queue-56`.

1. **Custom SDK reads the minified CSS only (measuring case first), then ship `plainkit.min.css` only (issue 1 above: 31 KB unpacked, about 7.4 KB packed).**
   - Step a (this PR, about 200 lines, no package change): change `custom-sdk-logic.js` and `custom-sdk-breakpoints.js` so every read and rewrite works on the minified file, keep writing both outputs from it if needed; add a node case in `custom-sdk-logic.test.mjs` that bakes a theme and rewrites a breakpoint on `plainkit.min.css` and compares the result to the unminified path; add a browser case for the theme editor export.
   - Step b (next PR, about 100 lines): exclude `dist/plainkit.css` from `core/package.json` files, point `./plainkit.css` at the minified file, update the `package-size` and `check-package` expectations. Lowers the unpacked measure by 31,182 (318 B spare becomes about 31 KB spare) with the 957,700 ceiling untouched.
   - Checks: `node --test core/tests/custom-sdk-logic.test.mjs core/tests/package-size.test.mjs`, `node scripts/attest-browser.mjs --filter "custom-sdk,theme-editor"`, `node scripts/check-package.mjs <dir>` after `dotnet pack`.
2. **Reserved-name test (issue PR 2, #1980; about 60 lines).** Independent of the measurements and the cure for the `$z` / `$b` class of bug, which the 10 B spare on `input`, `page-header` and `data-table` keep inviting. Check: the new test plus `core/tests/ownership.test.mjs` and `element-surface.test.mjs` unchanged.
3. **Builder elements to plainkit.ide, in two PRs if it exceeds 400 lines (decision 3; 10,681 B gzip, 27,450 B raw).** First PR: only the dependency work, no move: make `pages/print-page`, `pages/tool-page`, `js/roving.js`, `js/listbox.js`, `js/shortcuts.js`, `js/palette-logic.js` and the sample template not depend on the four elements (or list the ones that must stay), proving by `scripts/tests/packages.test.mjs` that a move would not break core. Second PR: the move, the Blazor wrappers, the changelog note, its own minor. Checks: `node --test scripts/tests/packages.test.mjs core/tests/tiers.test.mjs core/tests/package-size.test.mjs`, the filtered `dotnet test`, `node scripts/blazor-browser.mjs --changed --base origin/integration/queue-56`, `node scripts/attest-browser.mjs --elements design-surface,property-grid,code-view,command-palette`.

Not recommended as a next PR: "table-edit out of the first-load graph" (already lazy, 0 bytes of page weight; moving it to a package is owner-level), and a dead-code removal PR (under 1 KB, unproven per item).

After PR 1 step b, the core ceiling pair can be reset by the owner (unpacked measure about 926 KB, packed about 279 KB), which is the owner step decision 1 reserved.

## 7. What this step did not measure

- Base runtime and per-module budgets only as pass/fail from `budgets.test.mjs` (27 of 27 node tests pass); the dock and markdown-editor overrides were not re-measured against `elementGzKbOverrides` beyond the gzip table above.
- Lazy-chunk savings (ranks 5 and 6) are estimates; each needs a per-PR bench (`scripts/bench/ref-pages.mjs`).
- Gzip numbers for elements use level 9 on `core/dist`; the budget tests may strip comments or use another level, so compare trends, not the last byte.
