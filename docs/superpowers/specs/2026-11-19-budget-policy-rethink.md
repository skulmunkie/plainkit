# Budget policy rethink: measure and gate what a consumer feels, and stop making authors fit cracks

Status: proposal for the owner, no code, ceiling or test changed. Date: 2026-11-19. Tree: `main` at `675ecc73` (Release 0.34.1), after `node scripts/bootstrap.mjs`.
Follows `2026-11-17-size-budgets-measured.md` (#1985 step 1) and answers the owner direction of 2026-11-19: the budgets are too strict, they push substandard
workarounds, keep modularity and leanness, remove the stress of "does it fit in this crack".

## 1. Summary and recommendation

The budgets protect real things (a lean first load, a small package), but the way they are set does not: almost every ceiling is a **byte-exact ratchet at today's
measured size**, so headroom is zero by construction and every feature pays for itself in the author's attention. The cost shows in git: a release failing by **1 B brotli**
(table 17,501 against 17,500, fixed by a 61 B trim, #2067), `==` for `===`, unquoted selectors and a dropped condition to save bytes, satellite files (`table-*.js`, `field-extras.js`, `dock-*.js`) that
exist because the parent file had "no room", optional-package ceilings reset twice on main (`954ac247`, `aa0876af`), and a base-class field collision (#1980) that one-letter names made silent.

**Recommendation (option B below, details in section 5):**

1. Keep three gates a consumer feels: **page weight of the three reference pages**, the **page layer** and the **app entry graph**. Change *how the ceiling is set*: ceiling =
   the measured size at the last release plus **5 percent**, recomputed by `set-ceilings.mjs` in the release pull request and only there. Inside a release cycle a pull request
   has several hundred bytes of room instead of 3 to 13.
2. **Retire the per-element 4 KB rule and its two overrides as a gate.** It becomes an advisory table in the trend report (and a very high backstop, 8 KB, against an accident).
   Page weight already measures what an element costs a page that uses it.
3. Optional packages and core packed/unpacked: ceiling = last release plus **5 percent** (was +1 percent, or +0.5 percent), set the same way.
4. **Pressure valve:** lazy parts and optional packages (#1656) stay the way to keep first load lean, with a rule for *what must be lazy* (section 5.4), instead of splitting
   a file because it is 80 B over.
5. **Cheap exception path:** a ledger entry with a pull-request link and the orchestrator's or owner's approval in that pull request. No carve-out issue, no expiry test.
6. **Readable code in size-critical files**: minification does the size work. Add the reserved-name test (#1980) and stop trimming source text for bytes.
7. **A trend report per release** (`scripts/size-trend.mjs`, appended to a committed history file by the release pull request) so slow growth is seen even though no single pull request fails.

What is not measured and why is in section 8; the numbers below are measured on this tree unless marked.

## 2. Inventory of every budget (measured on `675ecc73`)

Enforcement: **hard** = never exceeded, no exception; **ratchet** = only down, up only through a ledger exception or `set-ceilings.mjs`; **advisory** = not planned yet (#1985 plans it for the element rule).
Headroom is limit minus measured. "Felt" is whether a page visitor or an app user pays it (Y), or only an installer, the registry or a developer (N).

How measured: `node scripts/set-ceilings.mjs --measure --no-payload --out <scratch>` (packages, page weight); `npm pack --dry-run --json` in `core/` (npm tarball); per-file `gzip -9` over `core/dist/elements`
and `core/dist/plainkit*.css`; `node --test core/tests/app-budgets.test.mjs core/tests/budgets.test.mjs core/tests/page-weight.test.mjs core/tests/package-size.test.mjs core/tests/budget-ledger.test.mjs` (21 of 21 pass).

| Budget (ledger id) | Limit | Measured | Headroom | Protects | Felt | Enforcement |
|---|---|---|---|---|---|---|
| page weight button, gzip / brotli (`page-weight-button-*`) | 18,100 / 15,600 | 18,039 / 15,588 | 61 / **12** | first load of a page with a button, 12 requests | Y | hard (`page-weight.test.mjs`, moved by `set-ceilings --allow-page-weight`) |
| page weight form, gzip / brotli | 28,200 / 24,400 | 28,134 / 24,387 | 66 / **13** | first load of a form page, 16 requests | Y | hard |
| page weight table, gzip / brotli | 20,100 / 17,500 | 20,020 / 17,440 | 80 / **60** | first load of a table page, 12 requests | Y | hard |
| page layer `plainkit.css` gzip (`page-layer-css-gz-kb`) | 10 KB (10,240) | 7,395 (min 6,873) | 2,845 | CSS every page loads | Y | hard |
| app entry graph (`app-entry-gz-kb`) | 22 KB (22,528) | 21.99 KB (21 files, comments stripped) | about **10 B** (the test prints two decimals) | cold start of a `mountApp` application | Y (apps only) | hard cap (#514), never raised |
| largest app page-type chunk (`app-page-type-gz-kb`) | 3 KB | 1.38 KB | 1.62 KB | one page type's lazy chunk | Y (apps) | ratchet |
| Blazor payload coreOnly (`blazor-payload-core-only`) | 745,062 gzip | 727,065 (2026-11-17, **not re-measured**) | about 18 KB | the published WASM app download | Y (Blazor) | hard |
| Blazor payload full (`blazor-payload-full`) | 1,097,550 gzip | 1,075,571 (2026-11-17, **not re-measured**; ceiling was 1,084,709 then) | about 22 KB | same, all extras | Y (Blazor) | ratchet, `set-ceilings` only |
| per-element gzip (`element-gz-kb`) | 4 KB (4,096) | max 4,090 (140 core element files; median 1,578; 22 above 3 KB; 13 above 3.5 KB) | see below | one element's lazy file | Y only through page weight | ratchet; advisory is planned (#1985) |
| element override markdown-editor | 4.12 KB (4,219) | 4,090 | 129 | same, optional package | N | ratchet |
| element override dock | 3.65 KB (3,738) | 3,660 | 78 | same | N | ratchet |
| base runtime `element.js` + `element-core.js` (`base-runtime-gz-kb`) | 2.8 KB | 1,853 + 616 gzip alone, passes | about 0.3 KB | every element's base | Y | ratchet |
| behaviour module gzip (`js-module-gz-kb`) | 6 KB | passes (largest not printed) | not measured | one `core/js` file | N | ratchet |
| base set `plainkit.js` imports (`base-js-gz-kb`) | 10 KB | passes (not printed) | not measured | the plain-page script set | Y | ratchet |
| npm core packed (`package-plainkit-packed`) | 291,492 | 286,455 | 5,037 (1.7 %) | registry download, install time | N | ratchet |
| npm core unpacked (`package-plainkit-unpacked`) | 957,700 | 940,697 | 17,003 (1.8 %) | disk, `node_modules` | N | ratchet |
| zip plainkit.tools | 280,360 | 277,581 | 2,779 | download of the dev-tools extra | N | ratchet, `set-ceilings` only |
| zip plainkit.ide | 204,861 | 202,832 | 2,029 | same, IDE extra | N | same |
| zip plainkit.markdown | 16,078 | 16,071 | **7** | same, Markdown extra | N | same |
| zip plainkit.dock | 23,038 | 22,809 | 229 | same | N | same |
| zip plainkit.canvas | 46,502 | 46,041 | 461 | same | N | same |
| zip plainkit.audit | 53,500 | 52,737 | 763 | same | N | ratchet (core/audit stay one-way) |
| zip plainkit.blazor | 2,120 | 1,925 | 195 | the analyzer package | N | ratchet |
| unpacked ceilings of the optional packages (`maxUnpackedBytes`: tools 858,778, ide 965,522, audit 137,500, markdown 40,216, dock 60,053, canvas 115,884, blazor 3,640) | as listed | tools 857,739, ide 960,161, audit 133,288, markdown 40,186, dock 59,458, canvas 114,736, blazor 3,307 | tools 1,039, ide 5,361, audit 4,212, markdown **30**, dock 595, canvas 1,148, blazor 333 | disk | N | ratchet |

Elements nearest the 4 KB rule (gzip -9 of `core/dist/elements/*.js`): markdown-editor 4,090 (own override), page-header 4,087 (**9 B** spare), input 4,086 (**10 B**), table 4,055 (**41 B**),
data-table 4,010 (86 B; it was 4,092 on 2026-11-17, so someone paid about 80 B to get it there), heat-map 3,959, field-group 3,941, combobox 3,901, canvas 3,830, doc-page 3,796.

Reading the table: **the four hard budgets that vary per change (the three page weights, plus the app entry) sit within 0.1 percent of their limit**; every budget with a consumer-visible effect has a headroom between 7 B and 80 B except the page layer.
The only large headrooms are on budgets nobody feels (npm packed and unpacked at 1.7 percent, optional zips at 1 to 2 percent).

The owner direction quotes 704 B (tools) and 483 B (ide) over. The commit that reset them (`aa0876af`, #2065) records tools **measured 277,584 against the old ceiling 276,592 (992 B over, reset to 280,360)** and ide
**202,832 against 202,099 (733 B over, reset to 204,861)**; the 704 and 483 figures are probably from an earlier tree and could not be reproduced from git. Either way the order of magnitude is the point: one feature (row actions) broke two ceilings.

## 3. What the budgets cost: workarounds found in history and source

Each row is real. "Better" is what the code would have been without the pressure; none of these needs a code change in this proposal, they are the evidence.

| # | Where | What was done for bytes | Better without the pressure |
|---|---|---|---|
| 1 | `6e56b2ec` (#2067), `core/elements/table/table.js` (`get wide()`), `core/js/table-data.js` (`nextSort`) | `===` became `==` | `===` (strict equality is the repository's norm everywhere else; esbuild does not turn `==` into `===`, so this is a real source change) |
| 2 | `6e56b2ec`, `core/elements/table/table.css` | `[density="compact"]` became `[density=compact]` (two lines) | quoted attribute selectors, as every other stylesheet; a CSS minifier is the place to drop quotes (`core/tools/build.mjs` `minifyCssReal` already strips other bytes, so doing this at build is possible and free) |
| 3 | `6e56b2ec`, `table.js` render | `if (this.selectScope === 'all' && !this.selected.length) ...` became `if (!this.selected.length) this.selectScope = 'page'`, dropping a condition so it assigns on every render | the explicit condition: intent readable, no needless write that could notify observers |
| 4 | `6e56b2ec`, `core/js/table-vw.js` | the named, commented `attach()` function was inlined and its explanation comment deleted | a named function with its comment; comments are stripped by the build anyway, so deleting them bought nothing |
| 5 | `6e56b2ec`, `table-shed.js` | `data-pin` moved from the hot render path into the lazy part (acceptable) but written as one long statement; `frame()` set max-height "in one call" | the lazy move is fine as design; the rest is line-golf that would normally be two readable statements |
| 6 | `table.js` (current source), render body | `const k = this.list('columns'), r = V.view(this), ids = ..., s =this.chosen(ids), sel = ...`: one-letter locals and a stray `s =this` left by trimming | named locals (`columns`, `rows`, `chosen`); the minifier renames locals for free |
| 7 | #1980 (found by #1977/#1979) | element private fields share the base class's `this.$x` namespace with one-letter names; `this.$b` (base bindings) was overwritten and every `pk-data-table` render threw; the fix was renaming to `$z` | descriptive private names with an element prefix, plus the reserved-name test #1980 asks for; `table.js` still uses `$m`, `$s`, `$mm`, `$z` as lazy-part keys |
| 8 | `core/js/table-focus.js`, `table-expand.js`, `table-scope.js`, `table-vw.js`, `field-extras.js` (headers: "kept out so its own module stays inside the per-element budget", "has no room for them in its gzip budget", "kept out of its file for the gzip budget #1725") | an element's own code split into satellite files to stay under 4 KB, including code on the everyday path (header rows, row focus, async commit) | one cohesive file where the code is used on every render, a lazy part only where the code is rare (row expansion, windowing above 500 rows, selection scope) |
| 9 | `core/js/dock-drag.js`, `dock-flyout.js`, `dock-tree.js`; `3348d24c` (#711 "Split dock.js into shared modules to fit the blanket gzip budget"); comment "kept here so dock.js carries no list of them, #432 D2b budget" | dock split into seven modules; `dock.js` forwards "thin methods" by name so its own file stays under the override | the dock extra is already its own optional package (#1656), where an element budget protects nobody: one file or a split by concept, not by byte |
| 10 | `core/js/table-vw.js:10-12` | "the threshold is fixed (500 rows), no prop, to keep this element inside its own gzip budget" | a `windowing-threshold` property; a documented feature was deferred for bytes |
| 11 | `358615db` (#1544) | Manifest integrity hashes changed from SHA-384 to SHA-256 to save 16 bytes by 567 entries | SHA-384 (the usual Subresource Integrity recommendation); the cost was about 9 KB raw in an npm package nobody feels |
| 12 | `93ec1c55` (#1231), `button.css` | the `overflow=wrap` rules rewritten to drop the host `max-inline-size` ("about 16 bytes"), margin left 68 B | the original three rules; 16 B for a layout subtlety that needed a browser case to prove equivalent |
| 13 | `cc337e48` (#1500), `93ec1c55` | the generated `registry.js` template lost its spaces and trailing newline, then a space after the colon, for 10 and 5 bytes on every page; the commit notes "the margin on form is 1 byte; the next element will need real trimming or a lazy registry" | a registry that is lazy or generated minified once (real fix) rather than three rounds of 5 to 10 B; this is the exact "crack" pattern |
| 14 | `#1253` series (`94af7bb4`, `5011af37`, `a201efd4`, `0ea16c23`, `67f85d68`), `core/tests/package-size.test.mjs` header (13 lines of measurement history) | eight consecutive pull requests that shaved documentation, tables and skill text from the npm tarball to stay under a ceiling nobody downstream feels | none of that was a consumer problem; the 2026-10-20 raise was reversed once the skills left the package, so the ceiling was raised and re-lowered within a month |

Not every split is a workaround: `6dbfc8c6` (bundle-page keeps lazy imports lazy, bundle row 40.3 to 31.2 KB gzip, #1644) and `c9149328` (dialog stops importing menu-logic, per element 38.4 to 37.5 KB) cut real
bytes from what a page loads. The distinction the policy should draw is **fewer bytes loaded** (good, and visible to a reference page) against **fewer characters in a file** (workaround, invisible to the consumer).

## 4. Why byte-exact ratchets make this worse

- A ratchet that is set to "measured, rounded up by less than 2 percent" (page-weight file comment) leaves 60 to 400 B on a 17 to 28 KB page; the file also says it only ever shrinks, so each win is spent by the next feature.
- Brotli output is deterministic for a given build, so a 1 B failure is real and reproducible, not flaky: 0.34.0 failed on `core/VERSION` growing by one byte.
- A budget that can only be eased by an owner carve-out issue with an expiry date (CONTRIBUTING, "Proposing a budget exception") costs more than the feature when the overage is 700 B.
- The consumer impact of what is being fought for is small and can be put in numbers: 61 B of a 17,440 B table page is 0.35 percent; on the "slow 4G" profile of `scripts/bench/wire.mjs` (about 1.6 Mbit/s, 200 KB/s) 61 B is about 0.3 ms, and a 5 percent allowance (872 B on the table page) is about 4 ms of transfer. That is an estimate from bandwidth alone, not a measured page-load figure.

## 5. Options and recommendation

### 5.1 The options

- **A. Status quo plus a cheaper exception path.** Keep every ceiling byte-exact; only the exception paperwork shrinks. Does not remove the stress (no headroom), only the paperwork afterwards.
- **B. Gate the consumer-felt metrics with release-relative headroom; everything else reported (recommended).** Page weight, page layer and app entry stay hard; their ceiling is last release measured + 5 percent, set at release.
  Element, module, package and payload budgets become advisory or generous backstops. Trend report per release.
- **C. Remove all size gates; trend report only.** Maximum freedom, but a regression is found only by a person reading a report. Not recommended: the 11-17 numbers show page weight is the one place a size gate has paid for itself (#1644 found 9 KB of avoidable first-load bytes that a ratchet had not).

### 5.2 Per metric under B

| Metric | Today | Under B |
|---|---|---|
| page weight, 3 reference pages (gzip and brotli) | byte-exact ratchet, never raised | **hard**, ceiling = last release measured +5 percent, requests exact; moved only by `set-ceilings.mjs` in the release pull request |
| page layer CSS | hard 10 KB, 2,845 B spare | hard 10 KB unchanged (already roomy: 28 percent headroom) |
| app entry graph | hard cap 22 KB, ~10 B spare, never raised | hard, **owner decision**: reset to last release +5 percent (about 23.1 KB) in one step, then the same release rule; the #514 rule "offset growth elsewhere" is replaced by "stay inside the release ceiling, lazy-load what is rare" |
| per element 4 KB (+ markdown-editor 4.12, dock 3.65 overrides) | ratchet | **advisory** (report lists the top 15 and any above 4 KB); hard backstop 8 KB (nothing is near it: max 4,090) so a mistake cannot ship |
| base runtime, js-module, base-js, app page type | ratchets | advisory in the trend report, backstop at 2x the limit (5.6, 12, 20, 6 KB) |
| core packed / unpacked | ratchet +0.5 to 1 percent | ceiling = last release +5 percent, set at release; reported, hard only through the test |
| optional package zips and unpacked | measured +1 percent, `set-ceilings` only | measured +5 percent, `set-ceilings` only (the owner rule of 2026-10-25 changes from 1 to 5); hard but not a reason for a carve-out issue |
| Blazor payload coreOnly / full | hard / ratchet | coreOnly hard at last release +5 percent; full advisory with the same backstop |

### 5.3 Exceptions

An exception is a **ledger entry added in the pull request** with `{ budget, pr, approvedBy, reason }`, approved in that pull request by the owner or the orchestrating agent. No carve-out issue, no required plan, no expiry
test. The ledger test keeps checking that every entry names a pull request and an approver, and the trend report lists active exceptions so they are visible each release. Hard gates stay exception-free but, because of the 5 percent release headroom,
a pull request should rarely need one.

### 5.4 What must be lazy (the pressure valve, #1656)

Replace "split until the file is under 4 KB" with a rule about **loading**:

1. Code that is not needed to render the element's first paint or a reference page and is used by fewer than about one in five consumers is a lazy part loaded on the attribute or property that needs it (the pattern table-edit, table-cols, table-expand, table-scope already follow).
2. A feature that a reference page graph does not load and that is large (above about 5 KB gzip) belongs in an optional package when it has its own audience (tools, ide, canvas, dock, markdown).
3. A file is never split, a feature is never deferred and a property is never withheld only to make a file shorter. If a file is large and its code is used on every render, it stays one file.

### 5.5 Readable code, minification does the size work

- Size-critical files (elements, `core/js` on a reference page graph) use readable names, `===`, quoted selectors, comments. The build (`esbuild transformSync` with `minify: true`, `minifyCssReal`) removes the characters.
- Add the reserved-name node test of #1980 next to `core/tests/ownership.test.mjs`: collect every base-class `this.$name`; fail when an element assigns one; require element private fields to carry a prefix. This removes the single most dangerous result of one-letter names.
- Optional (separate issue): a source test that bans `==`/`!=` in `core/` (allowing `== null`), so byte-golf cannot return.
- Real byte savings stay welcome: a generated registry that is minified once, a lazy chunk, fewer requests. They are measured on a reference page, not in a file.

### 5.6 How regressions are still caught

1. Hard gates on the three reference pages, page layer and app entry (a first-load regression above 5 percent over the last release still fails).
2. A **trend report** per release (section 7) and nightly: the same metrics with the delta to the previous release and to the 0.30.0 baseline (an arbitrary but fixed reference; the owner may pick another), plus the advisory element table.
3. The release pull request prints a warning for any metric up more than 5 percent over the previous release and requires an owner acknowledgement line for any up more than 15 percent over the baseline.

## 6. What each option does to 0.34.1 (headroom today, bytes)

Today = measured on `675ecc73`. Rule B uses the limit rounded to the byte, `measured x 1.05` (or 1.10 for the "10 percent" column); the limits are calculations, not yet in any file.

| Metric | Spare today (A, status quo) | Spare under B (+5 %) | Spare at +10 % |
|---|---|---|---|
| table page, brotli | 60 | 872 (ceiling 18,312) | 1,744 |
| table page, gzip | 80 | 1,001 (21,021) | 2,002 |
| button page, brotli | 12 | 779 (16,367) | 1,559 |
| button page, gzip | 61 | 902 (18,941) | 1,804 |
| form page, brotli | 13 | 1,219 (25,606) | 2,439 |
| form page, gzip | 66 | 1,407 (29,541) | 2,813 |
| page layer | 2,845 | 2,845 (unchanged hard limit, 10,240) | 2,845 |
| app entry | ~10 | ~1,116 (23,644; owner call) | ~2,240 |
| core packed | 5,037 | 14,323 (300,778) | 28,646 |
| core unpacked | 17,003 | 47,035 (987,732) | 94,070 |
| zip tools | 2,779 | 13,879 (291,460) | 27,758 |
| zip ide | 2,029 | 10,142 (212,974) | 20,283 |
| zip markdown | **7** | 804 (16,875) | 1,607 |
| zip dock | 229 | 1,140 (23,949) | 2,281 |
| zip canvas | 461 | 2,302 (48,343) | 4,604 |
| zip audit | 763 | 2,637 (55,374) | 5,274 |
| element at the 4 KB rule: page-header 9, input 10, table 41, data-table 86 | 9 to 86 | not a gate (backstop 8 KB: 3,900+ spare) | same |

Option C has no gated ceiling at all (infinite spare) and A leaves every row in the "today" column. Under B, no pending work in `main` would have failed 0.34.0: the table page brotli of 17,501 is inside 18,312 with 811 B spare.
Under B a feature the size of row actions (the batch that broke two optional ceilings) fits without an exception: the tools zip grew 992 B past its old +1 percent ceiling and would have left 11,000+ B of room under +5 percent.

## 7. The trend report

`scripts/size-trend.mjs` (new, small, built on `set-ceilings.mjs --measure`, `scripts/bench/wire.mjs`, `npm pack --dry-run --json`, per-element `gzip -9`) writes a JSON and a markdown table:

- columns: current, previous release, 0.30.0 baseline, delta percent, ceiling and spare;
- rows: the three reference pages (gzip, brotli, requests), page layer, app entry, core packed and unpacked, each optional zip, Blazor payload (when measured), top 15 elements, number of elements above 3.5 and 4 KB, total gzip of `core/dist/elements`, active exceptions;
- stored: appended to a committed `core/tests/size-history.json` by the release pull request (a release artefact like `core/VERSION`), uploaded as a nightly artifact and pasted into the release pull request description.

## 8. Migration plan (small steps, each leaves `main` releasable)

Nothing starts before the owner answers section 9; AGENTS.md and CONTRIBUTING.md are not edited by this spec.

1. **Policy text, docs only.** Owner-approved wording in AGENTS.md ("Size budgets...") and CONTRIBUTING.md ("Proposing a budget exception"): release-relative ceilings, the lazy rule (5.4), the readable-code rule (5.5), the cheap exception. Changes `core/STANDARDS.md` "Size" if it names the 4 KB rule. No test change. (Does not change any number yet, so releasable.)
2. **Ledger and exception test.** `core/tests/budget-ledger.json` schema: `exceptions[]` becomes `{ budget, pr, approvedBy, reason }`, no `until`/`issue`/`plan`; `core/tests/budget-ledger.test.mjs` updated for the new shape and for the new classes (`hard`, `release` ceiling, `advisory`). `_comment` updated.
3. **`set-ceilings.mjs --release`** computes measured +5 percent (configurable) for page weight, core, optional packages, app entry; still the only writer. Run once on the integration tree for the first reset: page weight, core packed/unpacked, optional zips and unpacked, `blazorPayload.*` (needs a measured payload, `set-ceilings --measure` without `--no-payload`, heavy, done by the gate agent). Edits `core/tests/page-weight.ceiling.json`, `core/tests/package-size.test.mjs`, `packages.json`, `core/site/scorecard/scoring.data.js` (`appEntryGzKb` only with an owner yes).
4. **Element rule to advisory.** `core/tests/budgets.test.mjs` logs the element table and asserts only the 8 KB backstop; delete `elementGzKbOverrides` and the ledger rows `element-gz-kb`, `element-override-*`; same for base runtime, js-module, base-js, app page type (backstop at 2x). `core/tests/app-budgets.test.mjs` keeps the entry gate only. Scorecard text in `scoring.data.js` notes updated.
5. **Reserved-name test (#1980)** next to `core/tests/ownership.test.mjs` (do not edit that file). Optional: the `==` ban.
6. **Trend report** `scripts/size-trend.mjs`, `core/tests/size-history.json` seeded with 0.34.1, release workflow step and the release pull request template; a node test for the report's shape. Check in `scripts/verify.mjs` `CHECKS` and its FIX line (`--update-docs` refreshes the AGENTS.md table).
7. **Follow-up cleanups, separate small issues, no deadline:** restore `===`, quoted selectors, named locals, the explicit `selectScope` condition in `table.js`, `table-data.js`, `table.css`; consider re-merging satellite files that exist only for bytes (`table-focus`, `field-extras`, the dock modules) when their owning change next touches them. Each is judged by page weight and the browser cases, never by a per-file figure.

Steps 1 to 3 are one reviewable batch and the only ones that move numbers; steps 4 and 5 are independent; step 6 can land at any point and should land before the first release under the new rule.

## 9. Owner decisions (yes or no)

1. Page-weight, core, optional-package and Blazor `coreOnly` ceilings become "last release measured + 5 percent", set only in the release pull request by `set-ceilings.mjs`? (Is 5 right, or 10?)
2. The app entry cap of 22 KB (#514) is re-based the same way (about 23.1 KB, then +5 percent per release)? This overrides the 2026-10 decision that it never grows without an equal cut.
3. The per-element 4 KB rule and the two overrides stop being a gate and become an advisory table plus an 8 KB backstop?
4. The other ratchets (base runtime, js-module, base-js, page type, Blazor `full`) become advisory with a 2x backstop?
5. The optional-package rule of 2026-10-25 changes from +1 percent to +5 percent?
6. Exceptions need only a ledger entry with the pull request link and an owner or orchestrator approval (no carve-out issue, no expiry)?
7. The lazy/optional rule of 5.4 (including "never defer a feature or split a file only for bytes") is adopted in AGENTS.md and STANDARDS?
8. The reserved-name test (#1980) is added, and the optional `==`/`!=` ban in `core/`?
9. The trend report is added and committed history is a release artefact; a metric above +15 percent of the 0.30.0 baseline needs an owner acknowledgement line?
10. The existing workarounds in section 3 (rows 1 to 6, 10) are cleaned up opportunistically, not in one sweep?

## 10. Risks and how the trend report covers them

| Risk | Cover |
|---|---|
| Slow growth of 5 percent per release compounds (+22 percent in four releases) with no single failure | the trend report shows the delta to the previous release and to the 0.30.0 baseline; +15 percent over the baseline needs an owner line; the ceiling is *measured* not *previous ceiling*, so it does not compound silently |
| A big first-load regression on a page that is not a reference page (the three pages are button, form, table) | not caught by a gate (as today); the trend report adds the sum of `core/dist/elements` and the top 15; a fourth reference page (a list page or an app) can be added when the owner wants, at one ceiling line |
| Advisory element sizes are ignored and an element grows to 8 KB | backstop at 8 KB fails; the top 15 is in every release report; the lazy rule 5.4 is the review checklist |
| The 5 percent release ceiling is spent early in a cycle and late pull requests are blocked | headroom is 800 to 1,200 B per reference page against 12 to 80 B today; if still tight the fix is a lazy part (5.4), the cheap exception covers the rest |
| Packages grow unnoticed (registry size) | 5 percent per release plus the trend row; packed size has no consumer-visible effect but is reported |
| The owner rule is read as "no discipline" | the hard gates stay; the policy asks for leaner loading (fewer bytes a page loads) rather than leaner source characters |
| `set-ceilings.mjs --release` mis-sets a ceiling | it is the only writer, runs in the release pull request, and `budget-ledger.test.mjs` plus the page-weight test still run |

## 11. What could not be measured, honestly

- **Blazor payload** (`coreOnly` and `full`): `--no-payload` was used because a publish is heavy and two other agents were running. The figures above are from 2026-11-17 and are marked.
- **Consumer time effect**: only bandwidth arithmetic (bytes over 1.6 Mbit/s); no page-load timing was run, because `scripts/bench/wire.mjs` is a timing bench and the machine was shared.
- **App entry headroom**: the test prints two decimals (21.99 KB of 22), so "about 10 B" is derived from rounding and from the 2026-11-17 measure (10 B); exact bytes would need a one-off script.
- **js-module and base-js largest files**: the tests pass; the tests do not print the largest value and it was not computed.
- **The 704 and 483 B overages** quoted in the direction could not be reproduced from git; the commit shows 992 B and 733 B (section 2).
- The +5 and +10 percent figures are arithmetic on measured values, not measured under a new rule; the right percentage is an owner decision (question 1).
