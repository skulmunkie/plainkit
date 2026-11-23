# Theme editor v2: what is left of #107, and how it joins the custom SDK export (#124)

Status: design only, 2026-11-21. Verified against `origin/main` (27943a29). No product code in this change. Reads #107 (theme editor v2) and #124 (custom SDK export) as they are on `main` today.

## 0. The finding that shapes this spec

Issue #107 reads as a wish list, but on `main` eight of its nine boxes are built (palette generator, presets, undo/redo and change list, export/import/share, Blazor parameters, docs; the Contrast tab is the live audit's first half). #124 steps 1 to 3 are in as well (named breakpoints, the delta report, a Custom SDK tab). So "v2" is not a greenfield design. This spec (a) records what exists so the owner can judge it, (b) designs the open pieces, and (c) proposes the structural clean-up the growth now calls for. Section 3 gives options per capability with the shipped choice marked, so the owner can overrule a decision that is already made.

## 1. Today

| Concern | What exists | Where |
|---|---|---|
| Home | A lazy module that owns its nav: `mountThemeEditor(container, options)`; also an SDK Theme page; Blazor `PkThemeEditor` | `core/modules/theme-editor/`, `core/site/modules/theme.js` (17 lines), Blazor mapping |
| Size (raw / gzip, bytes) | `theme-editor.js` 45,717 / 13,024; `sdk-tab.js` 12,702 / 4,276; `theme-editor.css` 4,475 / 1,202; logic files: brand palette 10,225 / 3,692, custom-sdk 11,479 / 4,167, editor logic 9,898 / 3,583, presets 8,845 / 2,883, share 3,264 / 1,458, history 2,979 / 1,235; shared `colour.js` 2,324, `zip-store.js` 3,580, `custom-sdk.js` 5,823. About 111 KB of source in all, none in the page layer or the app entry (loaded only when the module mounts) | measured with `gzip -9` |
| Tabs | Tokens, Palette, Presets, Changes, Contrast, Export/import, Preview, Custom SDK | `theme-editor.js` header comment |
| How a theme is applied | Page target: one `CSSStyleSheet` in `adoptedStyleSheets` (CSP-safe, no `style` attribute). Element target: custom properties through the CSSOM (`style.setProperty`, the `dynamic.js` pattern). Swatches use a second adopted sheet (#1261) | `theme-editor.js` 131 to 162 |
| Storage and format | Overrides in `localStorage` under `storageKey` (opt-in, try/catch, logged), saved themes under `savedKey`; the format is the override block `PkThemeOverrides` takes (same names, same rules), plus JSON `{ shared, dark, light }` | header comment, `theme-editor-logic.js` |
| Share | `#pk-theme=z.<deflate base64url>` (plain `p.` form without `CompressionStream`), at most 4096 chars, decoded through the same `readImport` rules, expansion capped, no HTML sink | `theme-share-logic.js` |
| Accessibility today | One shared list `AA_PAIRS` (in `theme-editor-logic.js`), imported by the AA node test; a test asserts the scorecard `TEXT_PAIRS` are a subset. The Palette generator guarantees 4.5:1 on every pair by construction and moves a brand colour that cannot serve (the notes say where it landed). The Contrast tab audits all pairs in both themes under the current edits | `brand-palette-logic.js`, `colour.js` |
| Export of an SDK | Theme-only zip (no fetch), breakpoints, or both: rewritten `dist`, recomputed SHA-384 manifest, `plainkit.custom.json`, README; store-only zip; browser only, same-origin reads checked against release hashes | `sdk-tab.js`, `custom-sdk-logic.js` |
| Open in the issues | #107: scorecard contrast findings on gallery pages are not in the panel. #124: device-preset ruler and add/rename/remove of breakpoints, page-level responsive utility classes for another set, AA validation on export, step 4 (CLI, byte-equal to the browser), 5 (dynamic hook), 6 (Blazor exporter) | issue comments |
| Constraint on styles | The module-audit baseline holds the theme editor's `adoptedStyleSheets` uses (S1) as accepted: the editor's job is to write a theme as a sheet and a preview frame. Swapping to `style.setProperty` was tried and trades S1 for S2 (inline style); `createContextualFragment` trades S5 for S5. Standing rule: never edit a source to hide a finding, no allow-list entry without an owner decision | #1253 comments |
| Gaps | No forced-colors handling in the editor's chrome or in generated themes; the editor is one 45 KB file (the logic is already split out); no swatch element (samples are spans coloured through the CSSOM); no shared "theme document" type across module, CLI and Blazor | grep, header |

## 2. Goals and non-goals

Goals.

1. A consumer reaches a good, accessible theme from one brand colour, and cannot export one that fails the documented text pairs without being told, in light, dark and forced-colors.
2. One theme model and one format used by the editor, the share link, saved themes, the Custom SDK export, the CLI (#124 step 4) and Blazor, so they cannot drift.
3. Close #107: the audit panel also shows the scorecard's contrast findings, with jump-to-token.
4. Close #124 steps 3 to 6 in an order that never leaves `main` unreleasable.
5. Keep the editor a lazy module; nothing lands in the page layer, the app entry or `coreOnly`.

Non-goals.

- No server, no account, no cloud save. Share is a link or a file.
- No new `pk-*` element in this spec (swatch: question 3). No runtime dependency.
- Element breakpoints cannot change live (custom properties are not allowed in `@media`; element CSS is in shadow roots): only the export changes them. Documented, not worked around.
- No theme marketplace, no import from other design tools.
- Not a rewrite of the editor: refactor by tab only where a step needs it.

## 3. Options per capability

### 3.1 Palette from one brand colour, accessible by construction

| Option | How | Pros | Cons |
|---|---|---|---|
| A. Shipped: lightness/chroma search per role | Pure function, targets 4.5:1 for every `AA_PAIRS` entry in both themes; property-tested over a hue/saturation/lightness grid, extremes and 400 seeded colours | The guarantee is a test, not a hope; no dependency | Moves the user's brand colour for text and fills (shown in the notes) |
| B. Fixed tonal scale (12 steps) with role mapping | Generate a scale, choose steps by role | Familiar, predictable | Guarantee depends on the mapping; more output tokens |
| C. Check only (warn on failure) | Audit, no generation | Never changes the user's colour | Not accessible by construction |

Recommendation: keep A. Add (1) a hard gate on export: export, share and Custom SDK list the failing pairs first and need an explicit "export anyway" confirm (a pk-dialog confirm), never a silent pass; (2) the audit declares which tokens the browser replaces in forced-colors (section 6).

### 3.2 Presets

| Option | Pros | Cons |
|---|---|---|
| A. Shipped: built-ins (default, high contrast at 7:1 in both themes, compact, roomy) plus saved themes in `localStorage` | Small; tested; per-viewer only | Saved themes do not follow the person across browsers |
| B. Presets as JSON files fetched on demand | A bigger gallery without code growth | A network read per preset; a hosted set to maintain |
| C. Presets from the host (`presets` option, Blazor `Presets`) | Already built | None |

Recommendation: A plus C (as is). B only if the owner wants a larger gallery (question 4); every preset must pass the same pair test.

### 3.3 Undo and redo

| Option | Pros | Cons |
|---|---|---|
| A. Shipped: one history of overrides, typing in a field is one step, cap 100, Ctrl/Cmd+Z outside text fields | Simple, tested | In memory only |
| B. Persist the history | Survives reload | Storage growth, stale entries, what was typed is kept |
| C. Branching versions | Compare variants | Heavy UI; saved themes already cover it |

Recommendation: A. A saved theme is the durable form.

### 3.4 Share, export, import

| Option | Pros | Cons |
|---|---|---|
| A. Shipped: URL fragment (deflate, 4096 chars), JSON, CSS, snippet, theme zip | No server; a fragment never reaches a server | A very large theme does not fit a link (falls back to a file) |
| B. Short links via a service | Short | A server, a privacy and CSP question, not offline |
| C. File only | Simplest | Less convenient in chat |

Recommendation: A. One schema `{ version, shared, dark, light, breakpoints? }` for the link, JSON and `plainkit.custom.json`, with one reader (step 1). Import is always: parse as text, validate against the token allow-list and value rules, apply as undoable edits.

### 3.5 Live audit

| Option | Pros | Cons |
|---|---|---|
| A. Shipped Contrast tab (pair list) only | Fast, no frames | Misses a pair that is not on the list |
| B. Plus the scorecard's contrast findings on the gallery frames under the current edits | Real components; closes #107 | Needs frames and measuring; run on demand |
| C. Run the whole scorecard in the editor | Everything | Heavy; duplicates the scorecard page |

Recommendation: B, on a button press, each finding with its selector and the token behind each side, jump-to-token. The scorecard's measuring is called, not copied; if a module cannot call it, it moves to a shared `js/` file first (step 4).

## 4. Comparison of the three directions

| | Finish and consolidate (recommended) | Rebuild as a design tool with its own model | Freeze at today |
|---|---|---|---|
| Closes #107 and #124 | Yes | Yes, later | No |
| Risk to `main` | Low (additive steps) | High | None |
| Accessibility gate | Export gate, forced-colors, scorecard audit | Same, new code | Pair test only |
| Bytes (lazy module, raw, estimate) | about +25 to 35 KB over the steps | larger | 0 |
| Blazor surface | A few mapping `extra` entries | Large | None |

## 5. Recommendation and PR-sized steps

Recommendation: finish and consolidate. Each step is one issue, one branch, one pull request of about 400 hand-written lines, in this order; each leaves `main` releasable.

1. **One theme document** (refactor, no behaviour change). `js/theme-document-logic.js`: `{ version, shared, dark, light, breakpoints? }`, one reader and writer used by share, JSON, saved themes, `plainkit.custom.json` import and later the CLI. Older formats are still read. Leaves: identical behaviour; round-trip tests across all entry points; hostile-input tests.
2. **Export gate and forced-colors.** Failing pairs listed first on export, share and Custom SDK, with an explicit confirm; the forced-colors declaration and audit rows; the generated `theme.css` carries a `forced-colors` block only where the SDK already does. Leaves: gate on by default, `gate: false` option for hosts.
3. **Split `theme-editor.js` along tab lines** (Tokens, Palette, Presets, Changes, Export) into files in the module folder loaded when a tab is first opened. Leaves: same API, smaller first load.
4. **Scorecard contrast in the audit panel** (closes the #107 box). Share the measuring, add an "Audit gallery pages" button, results with jump-to-token. A browser case measures a known failing edit.
5. **#124 step 3 remainder.** Breakpoint ruler with device presets (add, rename, remove), AA validation on export (uses step 2), responsive utility classes for the chosen set, "found the expected number of times" on every rewrite.
6. **#124 step 4: CLI** `scripts/custom-build.mjs --config plainkit.custom.json`, with a test that CLI and browser export agree byte for byte.
7. **#124 steps 5 and 6.** The runtime override hook for page-level breakpoint classes; Blazor: `PkThemeEditor` raises an event carrying the bundle, a guide on a custom `dist` (question 6), docs and skills.

Docs, skills, the gallery sample and a changelog fragment travel with each step. Blazor additions are mapping entries (`"extra": true`), never hand-written logic.

## 6. Risks

| Risk | Handling |
|---|---|
| CSP | No inline style or script. The theme applies through `adoptedStyleSheets` and CSSOM `setProperty` as today; the S1 baseline entries must not grow and no allow-list entry is added without the owner (question 7). Export and share use no HTML sink |
| Bytes | Lazy module only; each PR states measured bytes; split by tab (step 3) so the first mount does not carry export, audit and SDK code. The recommendation is not driven by a budget; the interim measured +1% rule applies to optional packages |
| Blazor surface | Mapping `extra` entries only; initial theme, presets and `OnThemeChanged` exist; step 7 adds the bundle event |
| Dark and light | Overrides are emitted per theme; the shipped leak guard (dark-only edits leaking into light) stays covered by its cascade test; every generated value is audited in both |
| Forced-colors | The browser ignores generated colours there, so the audit must not claim contrast for them; a browser case under forced-colors emulation; the editor's own chrome uses the tokens the SDK already maps |
| Share links | Size and expansion caps, text only, validated; a hostile link applies nothing and logs a warning |
| Storage | Per-viewer convenience only, try/catch; the editor works with storage blocked (a scenario exists) |
| Scope creep into #124 | Steps 5 to 7 wait on step 1 (document) and step 2 (gate) |

Lazy module or core: everything is the lazy `theme-editor` module plus its pure `js/*-logic.js` files (as today); nothing moves into core or the page layer. The one shared extraction is the scorecard's contrast measuring (step 4), a `js/` helper, not an element. Reuse: `pk-tabs`, `pk-dialog` (confirm), `pk-button`, `pk-input`, `pk-table`; no new element (consolidate before adding).

## 7. Questions for the owner (yes/no)

1. Is "finish and consolidate" (section 5) the direction, rather than a larger redesign?
2. Should export, share and Custom SDK refuse by default when a documented pair is below 4.5:1, with an explicit "export anyway" confirm?
3. A swatch is a coloured span set through the CSSOM today. Is that acceptable, or should a `pk-swatch` first be proposed in the components tracker (#336), after checking whether an existing element can take it?
4. Do you want a larger preset gallery fetched on demand (3.2 option B), beyond the four built-ins?
5. Should the one theme document (step 1) carry a `version` field and keep reading all older formats indefinitely?
6. For a custom `dist` in Blazor, prefer the static web assets override (no new option) over an `AssetsPath`-style option?
7. May the theme editor's `adoptedStyleSheets` use get a reviewed module-audit exemption in place of the baseline entries (the decision #1253 asked for)?
8. May `theme-editor.js` be split by tab (step 3) before the remaining features, though it changes no behaviour?
9. Should the audit's scorecard run (step 4) be on demand only, never automatic while typing?
10. Are persisted undo history and short links out of scope for good?
