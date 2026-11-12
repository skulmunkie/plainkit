# Size budgets review: which limits guard a consumer cost, and how to carve instead of raise

Status: proposal for owner decision. Date: 2026-11-12. No product code changes.

Direction (owner, 2026-11-12): the ceilings are too strict; they stop us doing things and doing some things right. Propose ways to carve code out so it comes down under a limit, and keep innovating.

## 1. Evidence from the last two weeks

- `table` reference page: 20,052 of 20,100 gzip and 17,493 of 17,500 brotli (about 7 B of brotli headroom).
- `data-table.js` at 4,087 of 4,096 B gzip; the media column became a one-line alias plus a lazy chunk instead of an attribute; the flyout ResizeObserver was dropped; a field was named `$z` to stay under 4 KB, and its predecessor `$b` collided silently with the base class (#1980). A size rule produced a correctness bug.
- Core packed ceiling: 283,300 raised to 291,492 by the owner (#1838); the older 900,000 / 3,350,000 package ceilings were raised once on 2026-10-20. plainkit.tools, ide and blazorPayload ceilings are re-set at nearly every gate (`packages.json` was touched by 24 queue merges since 2026-10-20).
- button and form page weights were shaved by 16 B twice.

Pattern: the number, not the consumer cost, decides the design. Names, features and attributes are bent to fit a number that has no consumer meaning at the 10 B scale.

## 2. Inventory

"Measured" = measured by me on the main checkout's `core/dist`. That dist is STALE (it still carries the skills and pre-split files), so package totals are not reproducible from it; per-element gzip is usable because the element files did not change shape. "Unmeasured" = needs a fresh bootstrap plus `node scripts/set-ceilings.mjs --measure --out m.json`, which I did not run (heavy, shared machine).

| # | Budget | Value | Enforced by | Protects | Headroom | History |
|---|---|---|---|---|---|---|
| 1 | Page layer `dist/plainkit.css` | 10 KB gzip (target 8) | `core/tests/budgets.test.mjs`, `scoring.data.js` `pageCssGzKb` | every page pays it; render-blocking CSS | measured 7,398 B gzip: about 2.8 KB spare | one-way, never raised |
| 2 | Element gzip, blanket | 4 KB (`elementGzKb`) | `budgets.test.mjs` | one element file's load cost | measured: markdown-editor 4,094, input 4,089 (7 B under 4,096), dock 4,037, field-group 3,945, table 3,941; only 5 of 133 elements over 3.8 KB; median about 2.5 KB | lowered from 4.5 after minify (#600); dock split for it (#639, #1658) |
| 3 | Element overrides | markdown-editor 4.12 KB, dock 3.65 KB | `scoring.data.js` `elementGzKbOverrides` | same | dock reads 4,037 B in the stale dist vs a 3.65 KB override: re-measure on a fresh build before trusting it | owner-approved exceptions |
| 4 | Base runtime | 2.8 KB (`baseRuntimeGzKb`) | `budgets.test.mjs` | cost on every page with an element | unmeasured | raised 2.5 to 2.8 once (#16) |
| 5 | Per behaviour module | 6 KB (`jsModuleGzKb`) | `budgets.test.mjs` over a hand-listed set | one lazy module | unmeasured | rarely touched |
| 6 | Base script set | 10 KB (`baseJsGzKb`) | `budgets.test.mjs` | plain page script cost | unmeasured | never raised |
| 7 | App entry graph | 22 KB hard cap (`appEntryGzKb`, target 6) | `core/tests/app-budgets.test.mjs` | first load of `mountApp` apps | unmeasured; "equal or greater cut" rule | raised once (#514) |
| 8 | App page-type chunk | 3 KB (`appPageTypeGzKb`) | `app-budgets.test.mjs` | one lazy page type | unmeasured | never raised |
| 9 | Page weight, 3 reference pages | button 18,100 / 15,600; form 28,200 / 24,400; table 20,100 / 17,500 (gzip / brotli), requests 12 / 16 / 12 | `core/tests/page-weight.test.mjs`, `page-weight.ceiling.json`, `scripts/bench/ref-pages.mjs` | real first-load bytes of three real pages | table about 48 B gzip and 7 B brotli (owner evidence); others a few dozen B | shrink-only; rounded up under 2 %; 6 commits touched the file |
| 10 | Core npm package | 291,492 packed / 957,700 unpacked | `core/tests/package-size.test.mjs`, `packages.json` plainkit | install and CDN size, not page weight | unmeasured on a fresh build | raised by the owner twice; the test header lists about 20 ratchet steps down |
| 11 | Optional packages (tools, markdown, dock, canvas, ide) | zip / unpacked, e.g. tools 847,783 / 272,110, ide 952,800 / 202,099, canvas 115,884 / 46,502 | `packages.json`, `scripts/check-package.mjs`, `scripts/set-ceilings.mjs` | download size of an opt-in artifact | set to measured +1 % at each gate | re-set at nearly every gate (owner rule 2026-10-25) |
| 12 | audit and blazor packages | audit 137,500 / 53,500; blazor 3,640 / 2,120 | same (ONE_WAY) | same | small | one-way |
| 13 | Blazor payload | coreOnly 745,062, full 1,084,709 gzip bytes | `scripts/blazor-extras-publish.mjs`, `packages.json` `blazorPayload` | static web assets a Blazor app serves | unmeasured (needs a .NET publish) | `full` re-set at gates |
| 14 | Static score ratchet | `site/scorecard/baseline.json` | `budgets.test.mjs` | quality score | n/a | goes up only |
| 15 | Scorecard bands | cssKb 32/100, jsKb 40/150 | `scoring.data.js` | advisory score | n/a | advisory |
| 16 | Handwritten Blazor line budgets | `blazor/handwritten.baseline.json` | `scripts/tests/blazor-wrapper.test.mjs` | maintainability, not bytes | n/a | shrink-only |

## 3. Classification

Guard a real consumer cost (keep): 1 page layer (render-blocking, every page), 9 page weight (granularity is wrong, see below), 7 app entry (first load of apps), 13 Blazor payload (what a hosted app serves), 11 opt-in package download (low stakes: nobody loads all of it).

Proxies that have become design drivers (the owner's complaint):
- 2 and 3, the 4 KB element rule. An element file is fetched once per page and cached; 4,089 B versus 4,200 B is invisible to a consumer. It is a proxy for "elements stay small", whose real concern is already row 9. It directly caused `$z`/`$b`, the lazy chunk for an alias and the dropped ResizeObserver.
- 10 core packed ceiling. It is install size and CDN storage; a page fetches elements individually, so the tarball is not page cost. It forced two owner raises.
- 4, 5, 6, 8 are sub-limits of the entry and page costs; a per-file number on top of a graph number double counts.

Hybrid: row 9 is the best signal but is measured on three pages, so a new feature on `table` is charged to whichever page contains it, and "measured rounded up under 2 %" is a few dozen bytes, which every change to table, button or form hits.

## 4. Carve-outs and structural levers (bytes first, limits last)

1. **Ship less of what is not runtime.** In the stale dist, per-file gzip: `dist/manifest.json` 16.3 KB (40 KB raw: SRI hashes plus metadata), `dist/plainkit.css` 7.4 KB plus `dist/plainkit.min.css` 6.9 KB (both shipped, same rules twice), `README.md` 7.0 KB, `llms.txt` 3.6 KB, `icons.svg` 2.9 KB (all measured). Options: drop `plainkit.css` from the package and export `./plainkit.css` as the minified file (about 7 KB gzip, 32 KB unpacked); a pointer README in the package (about 5 KB gzip); trim SRI hashes from the manifest where the loader does not verify them (up to about 8 KB, needs a check of who reads them). Estimate 15 to 20 KB packed with no runtime change. That alone makes the 291,492 ceiling a non-issue.
2. **Move rarely used features to optional packages (#1656 continuation).** Still in core in the stale dist: `js/table-edit.js` 18.5 KB raw / 7.0 KB gzip, `js/table-cols.js` 2.8 KB gzip, `js/compat-warn.js` 3.2 KB gzip (a debug aid), the page and builder elements `wizard-page`, `record-page`, `doc-page`, `image-gallery`, `design-surface`, `property-grid`, `command-palette`, `code-view` (each 2.5 to 3.5 KB gzip, about 22 KB together), and `js/app/*` (27.6 KB gzip; do not move, it is `mountApp`). Order: (a) `table-edit.js` into a feature chunk or optional package, about 7 KB gzip, if it is static today (not verified); (b) design-surface, property-grid, code-view, command-palette to plainkit.ide or tools, about 10 KB gzip; (c) `compat-warn.js` behind a dev entry, about 3 KB.
3. **Lazy chunk per feature (the table-media and url-state pattern).** The media column showed it works: the cost leaves the element file and the page graph and is paid on use. Candidates by size: input (4,089 B), field-group (3,945), table (3,941), data-table (3,423), calendar (3,416). Estimate 0.5 to 1.2 KB gzip each off the first-load graph. Cost: one extra request on use and an ordering test.
4. **Readable names versus minified.** The build already minifies with esbuild, so field names must never be chosen to hit a number. Add a reserved-name test (an element field that collides with a base-class member fails): this removes the `$b` class of bug whatever limits remain.
5. **Dedup of repeated CSS/JS.** The shared-control-styles spike (2026-11-04) found NO-GO: one gzip stream already dedups repeated blocks, a shared sheet adds a request, and for button, input, select it modelled +142 B gzip (worse); the all-100 sum saves 1.8 KB, which no page loads. Do not pursue as a size lever; the field-family string export is under 0.3 KB on a page with two of them, not worth a PR.
6. **Dead code.** Not measured. A light scan (exports with no importer in `core/js`; attributes unused by gallery or tests) is about half a day; expect low single-digit KB.
7. **Mapping meta and docs out of payloads.** Done for api.json (125 KB packed) and the IDE metadata (183 KB packed). Next: the manifest (lever 1). `breakpoints.report.json` stays (Custom SDK reads it). The Blazor payload (`full` 1.08 MB gzip) could drop metadata served as static assets; unmeasured.
8. **Honest page-weight headroom.** Brotli 17,500 for a 17,493 measure is false precision; see the policy.

## 5. Recommended policy

Hard gates (real consumer cost, with real headroom): page layer 10 KB gzip; app entry graph; Blazor payload `coreOnly`; page weight on the three reference pages plus one page per major feature set, with a fixed headroom of 3 % or 1 KB (whichever is larger) over the committed baseline, not "rounded up under 2 %".

Ratchets with a ledger and an exception path: rows 2, 3, 4, 5, 6, 8, 10, 11 and 13 `full`. A file `core/tests/budget-ledger.json` lists each budget, baseline, date and carve-out plan; the test fails only above baseline plus the headroom; a lower measure moves the baseline down (written by the tool, like `set-ceilings.mjs`). **Budget exception** (owner approved, one PR): an entry `{ budget, newLimit, reason, carveOutPlan: "issue N", expires: "YYYY-MM-DD" }`. While active the test uses `newLimit`; after the date it fails until the measure is back at or under the old baseline, so an exception cannot become permanent. AGENTS.md moves from "never raised" to "raised only by a ledger exception with a carve-out plan and an expiry". The core packed ceiling is reset to a new baseline after the lever-1 carve-outs (owner question 1), then ratchets.

Retire or demote: the blanket 4 KB element rule becomes a warning above 4 KB and a ledger entry above 5 KB (element weight stays governed by page weight and the feature budgets); rows 5, 6, 8 fold into the entry-graph and feature budgets; row 15 stays advisory; row 16 is maintainability and unchanged.

Per-feature budgets: each lazy feature chunk (table-media, url-state, table-edit, ...) gets its own ledger entry (default 2 KB gzip). Page-weight pages measure the static request graph, which a lazy chunk is not in, so a feature behind an attribute no longer moves `table`, and the chunk cannot grow unseen. A check (`scripts/bench/feature-chunks.mjs`, about 150 lines) finds lazy chunks by static `import()` scan and compares each to the ledger. A new feature then costs the page budget only its dispatcher line.

## 6. PR plan (about 400 lines each, in order)

1. **Ledger and exception path** (about 350 lines): `budget-ledger.json`, the test, AGENTS.md and CONTRIBUTING wording, `set-ceilings.mjs` writes the ledger. Neutral: every number is imported as is. Wins no bytes; unblocks the rest. Needs the policy approval (questions 2, 4).
2. **Reserved-name test** (about 60 lines, independent): fail on an element field that collides with a base-class member (#1980). No owner input.
3. **Package hygiene** (about 200 lines): minified CSS only, pointer README, manifest SRI audit. Wins about 15 to 20 KB packed. Needs question 5. Risk: consumers of `./plainkit.css`; keep the export mapped.
4. **table-edit out of the first-load graph** (about 400 lines): first verify whether it is already lazy; if static, a feature chunk with a ledger entry. Wins about 7 KB gzip on pages with a table if static, otherwise nothing. Needs a browser case for the editing path.
5. **Builder and IDE elements to plainkit.ide** (about 300 lines of packages.json and import-graph changes, per the #1656 pattern). Wins about 10 KB gzip core. Needs question 3.
6. **Lazy chunks for the capped elements** (input, field-group, table: one PR each, about 250 lines). 0.5 to 1.2 KB gzip each. Each needs UI review and a browser case.
7. **compat-warn behind a dev entry** (about 100 lines): about 3 KB gzip.
8. **Dead-code scan** (about 150 lines to report, then separate removals): unknown win.

After PRs 1 and 3 the 4 KB rule is demoted in a tiny PR (about 40 lines).

## 7. Risks

- A ledger with expiries can nag; use one weekly report from the ledger tool and fail only at expiry.
- More headroom invites growth; the ledger shows direction and page weight still gates real first load; demoting the element rule must keep a per-element warning.
- Lazy chunks add requests and waterfalls: each needs a measuring browser case, and the request counts on the page-weight pages stay.
- Optional packages cost integration complexity (Blazor option sets, loader fallbacks); the #1656 import test (core imports nothing from optional files) guards it.
- Dropping `plainkit.css` from the package could break consumers: keep the export alias and add a `changed` changelog entry.

## 8. What I could not measure

- A fresh packed and unpacked core size (the main checkout's dist is stale), the Blazor payload (needs a .NET publish), the base runtime, entry graph and per-module margins, and the exact current numbers of the three page-weight pages (their headroom is the owner's evidence). One fresh `node scripts/bootstrap.mjs` plus `node scripts/set-ceilings.mjs --measure --out m.json` on the integration tree gives all of it; I did not run it because it is heavy and another agent was working.
- Savings for levers 2, 3, 6 and 7 are estimates from per-file gzip sums and need the bench per PR.
- Whether `table-edit.js` is already lazy; dead-code savings.

## 9. Open questions for the owner

1. May the core packed ceiling be reset to a new baseline once the package-hygiene and first carve-outs land (set to measured plus ledger headroom, not simply raised)?
2. May budgets be per-package and per-feature (ledger entries) rather than per-page only, with page weight kept as the first-load gate?
3. Are design-surface, property-grid, code-view and command-palette allowed to leave core for plainkit.ide or tools?
4. Is an owner-approved "budget exception with a carve-out plan and an expiry date" an acceptable replacement for "never raised"?
5. May the unminified `plainkit.css` leave the package, with `./plainkit.css` exported as the minified file?
6. Should the 4 KB element rule become advisory (warn above 4 KB, ledger above 5 KB)?
