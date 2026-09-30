# Conformance audit: a CLI for consumer apps (with strict mode) and the same rules in the skills

Status: proposed design for owner review, not yet planned or implemented. Refs #518 (this work), #346 (app framework tracker), #336 (components the SDK lacks).
Builds on `2026-09-28-site-v2-strict-modules-design.md` (merged in #515): its rules S1 to S12 and its one pure rule engine are reused, not redesigned.

## Why

Owner request: a consumer-facing "PlainKit conformance audit". A person or an agent building an app on PlainKit should be able to run one command over their own source and be
told, with an exact replacement, where the app

1. duplicates something PlainKit already ships: a custom CSS class, an inline style or hand-rolled markup that a `pk-*` element covers, or hand-written interaction logic (drag, arrow-key navigation, focus trap, manual ARIA roles) that an element already owns;
2. uses the app framework wrongly or not at all: ad hoc page structure where a page type fits, no `defineModule`, a `custom` page where a built-in page type exists;
3. breaks the standards the SDK is built on: literal colours and sizes instead of tokens, missing accessible names, and so on.

It needs a **strict mode**, and it has to exist in two forms that do not drift: a real runnable CLI, and the same rules written into the generated `plainkit-sdk` and `plainkit-blazor` skills (so an agent
that never runs the CLI still writes conformant code, and an agent that does run it reads the same rule ids in the output and in the skill).

Why now: the internal versions of these checks already exist and work (`core/tests/composition-audit.test.mjs`, `core/tools/security.mjs`, `core/js/quality.js`, and the strict engine designed in #515),
but each is tied to this repository's paths and is invisible to a consumer. The strict-modules design says the engine is pure and file-list based precisely so a consumer CLI is cheap later (its section 3.6, question Q7).
This document is that later step.

## Non-goals

- No implementation. This pull request adds only this document.
- Not a redesign of the strict-module rules or engine (#515). Where this document needs a new engine capability it names it as an addition.
- Not a runtime check. The audit reads source text; it does not launch a browser. The scorecard (`core/js/quality.js`, `scripts/scorecard-sweep.mjs`) remains the rendered-page audit; the CLI may later hand it a URL (open question Q9) but does not in v1.
- Not a security boundary and not a linter for the consumer's own code style. It checks only conformance with PlainKit.
- No autofix in v1 (section 5.4). No editor plugin in v1.
- No new page types, elements or tokens. A gap the audit exposes is filed under #336.
- No decision on a Razor compiler-based analyser (a Roslyn analyser); the Blazor side is text scanning in v1 (section 7).

## 1. Shape: one table, one engine, three consumers

```
core/tools/audit/rules.mjs      THE table: one entry per rule (id, category, severities, detects, hint source, fix template, doc anchor)
core/tools/strict/engine.mjs    pure engine from #515: checkFiles(files, options) -> findings   (no fs, no globals)
core/tools/audit/scanners/*.mjs  per file kind text scanners (js, html, css, razor, vue/svelte script+template blocks) used by rules
core/tools/audit/data.mjs       builds the hint data from the repository's own catalogues (section 3) at build time
core/tools/audit/cli.mjs        thin: read config, walk files, call the engine, format, exit code
```

- The **rule table** is the single source. The CLI reads it; `scripts/build-skills.mjs` renders it into `references/conformance-rules.md` of both skills and into the workflow sections of each `SKILL.md`; the docs site page and the `--explain <id>` output render the same entries. This is the pattern of the `CHECKS` table in `scripts/verify.mjs` (whose FIX lines are also rendered into `AGENTS.md`, guarded by a test that fails when the copy is stale): a test `scripts/tests/audit-rules.test.mjs` fails when a rule id in a skill reference or in `--explain` has no table entry or the reverse, when a fix template names an element that is not in the catalogue, and when a rule lacks a doc anchor.
- The engine stays exactly as designed in #515: `checkFiles(files, { ruleset, allow })`, `files = [{ path, text }]`. The audit adds two rulesets (`consumer`, `consumer-strict`) beside `module`, plus the rule families in section 2. Rule objects keep the shape `{ id, applies(file), scan(file) }`; the audit adds `meta` (the table row) so the same object carries its documentation.
- A rule id is stable public API once released (section 11): `S4` never changes meaning. Ids: the strict-module rules keep `S1`-`S12`; the new families are `D` (duplication and hand-rolled interaction), `P` (pages and app structure), `T` (tokens and standards), `A` (accessibility), `B` (Blazor/Razor only, where a rule has no JS counterpart).

## 2. The rule catalogue

Severity columns: **normal** is the default run (advice an app can adopt gradually: warnings do not fail); **strict** is `--strict` (the strict-module rules applied to the whole app, section 6).
`error` fails the run (exit 1), `warn` prints and does not, `off` does not run. "Static" means source text scanning with the no-dependency scanners of section 4.

The catalogue is deliberately a starting set of 40 new rules (D 9, P 9, T 8, A 8, B 6; T9 is reserved) beside the retained S family; each has one detector and one fix message, so an implementation PR can land a family at a time (section 12).

### 2.1 Family D: duplicating an element or its interaction logic (owner goal 1)

| id | detects | normal | strict | how (static) |
|---|---|---|---|---|
| D1 | A raw tag that has a `pk-*` equivalent: `<button>`, `<input type=...>`, `<select>`, `<textarea>`, `<table>`, `<dialog>`, `<details>`, `<progress>`, `<nav>`, `<hr>`, `<label>` in a form, `<a>` styled as button, `<img>` avatar patterns, and so on | warn | error (this is S4 for the consumer) | tag scan of `.html`/razor/JSX/template text and of `createElement('<tag>')` calls, against the tag-to-element hint table built from element manifests (section 3.1) |
| D2 | Hand-rolled component by class name or role: a class whose name matches an element's name or alias (`.modal`, `.dialog`, `.tabs`, `.tab-panel`, `.dropdown`, `.tooltip`, `.toast`, `.accordion`, `.breadcrumb`, `.card`, `.badge`, `.spinner`, `.avatar`, `.stepper`, `.pagination`), in markup or CSS selectors, and `role="tablist"`, `role="dialog"`, `role="menu"`, `role="listbox"`, `role="tooltip"` written by hand | warn | error | class and role tokens compared with the element name/aliases table (the aliases field, #459: `pk-dialog` is also "modal", `pk-toast-stack` is "toast", `pk-drawer` "popup", `pk-dropdown` "dropdown menu") |
| D3 | Hand-rolled pointer drag: `setPointerCapture`, or `pointerdown` plus `pointermove` listeners in one file | warn | error | the existing regexes of `composition-audit.test.mjs`, moved into a shared scanner (that test then imports it, so the internal and consumer detectors cannot diverge) |
| D4 | Hand-rolled arrow/Home/End keyboard navigation: a `keydown` handler in a file that branches on two or more of the arrow, Home, End keys | warn | error | same, shared scanner; hint names `pk-tabs`, `pk-tree`, `pk-menu`, `pk-list-box`, `pk-radio-group`, `pk-splitter` by which keys and by which DOM roles the file mentions |
| D5 | Hand-built focus trap (`querySelectorAll('[tabindex`) or `focus()` cycling on Tab) | warn | error | same, shared scanner; hint: `pk-dialog` and `pk-drawer` already trap focus |
| D6 | Manual interactive ARIA role from script (`role = 'dialog'`, `menu`, `listbox`, `separator`, and the wider set `tab`, `tablist`, `tooltip`, `switch`, `slider`) | warn | error | same, shared scanner, extended set |
| D7 | Reimplemented behaviour by API: `<dialog>.showModal()` outside a `pk-dialog`, `navigator.clipboard.writeText` for a copy button (`pk-copy-button`), `IntersectionObserver` for lazy or back-to-top (`pk-back-to-top`), `matchMedia('(prefers-color-scheme` theme toggles (the theme API), `ResizeObserver` splitters | warn | warn | API-name table generated from element manifests (`replaces` field, section 3.1); this is a hint rule, never an error, because the API has other legitimate uses |
| D8 | Custom CSS that styles a PlainKit element from outside: selectors on `pk-*` or on `::part()` that set layout or colours the element already exposes as an attribute or `--pk-<element>-<part>` hook | warn | error | CSS scan: selectors containing a `pk-` tag; the fix names the documented hook or attribute from the element's `cssProperties` and `parts` meta. `::part()` styling of a documented part with a documented property is allowed (it is the extension point) |
| D9 | Utility-class layout: classes or CSS that build a stack, cluster or grid by hand (`display:flex` + `gap`, `display:grid`, `.row`, `.col-*`, `.d-flex`, `.flex-column`, bootstrap-like grids) | warn | error | class-token table plus CSS declaration pairs in files of the app's own CSS; fix names `pk-stack`, `pk-cluster`, `pk-grid`, `pk-toolbar`, `pk-splitter` |

D is the goal-1 family and reuses the internal detectors' regexes and the S1/S3/S4 tag logic; D8 and D9 are the two genuinely new detectors.

### 2.2 The strict-module rules for consumers (S family, from #515)

Kept with their ids and text. What differs for a consumer is only the severity and options (this is #515's table in section 3.6, made concrete):

| id | detects | normal | strict | consumer options |
|---|---|---|---|---|
| S1 | own CSS files, `@import`, `<link rel=stylesheet>`, `adoptedStyleSheets`, `<style>` | warn | error | `allowCss: ['app.css']` |
| S2 | style attribute or property (`style=`, `.style`, `cssText`, `setProperty`) | warn | error | none |
| S3 | `class`, `className`, `classList` | warn | error | `allowClasses: [...]` (patterns) |
| S4 | raw standard tags (superseded in a consumer run by D1 with the hint table; S4 remains the strict id and D1 the message) | warn | error | `allowTags: [...]` |
| S5 | HTML sinks (`innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `DOMParser`, `createContextualFragment`, `srcdoc`) | warn | error | `allowSinks` by file |
| S6 | imports outside the allowed set | off | error | `imports: ['@plainkit/core', './lib/**']` (the consumer names its own libraries) |
| S7 | direct platform access (`document.`, `window.`, `location`, `localStorage`, `addEventListener`, timers, `fetch` without a signal) | off | warn | `allowGlobals`. Off in normal mode because app code legitimately touches the platform; in strict a warning because the strict module rule is aimed at module code, not the app's bootstrap file |
| S8 | `custom` page type, `moduleFromMount`, module-defined `pageTypes`/`layouts` | warn | error | none |
| S9 | literal design values (colours, lengths with units, z-index, font names); this is family T's T1 to T3 in a consumer run | warn | error | own token file allowed (section 2.4) |
| S10 | module anatomy | off | off in v1; opt-in `--anatomy` | the anatomy needs `defineModule` conventions the consumer may not follow |
| S11 | per-module tests and scenarios | off | off | not applicable to a consumer |
| S12 | per-module size budget baseline | off | off in v1 | a consumer sets its own; possible later (Q6) |

### 2.3 Family P: pages and app structure (owner goal 2)

| id | detects | normal | strict | how (static) |
|---|---|---|---|---|
| P1 | No `mountApp` in an app that has more than one page-like route or HTML entry: several `.html` pages each with their own header, nav and `<script type=module>` where one `mountApp` shell with modules would do | warn | error | file walk: count entry HTML pages that share the same nav text or that import `plainkit.css`; the fix names `mountApp(container, config)` and the docs page |
| P2 | `mountApp` config without `defineModule` modules (everything in one `pages` blob), or a module without `id`/`title`/`routes`, or modules that build the nav by hand | warn | error | AST-free scan of `defineModule(`/`mountApp(` call shapes; needs the parser option for exactness (section 4.3) but the presence check is a text scan |
| P3 | A route or module using `custom` (`config.mount(host, ctx)`) or `moduleFromMount` where a built-in page type expresses the view | warn | error (this is S8) | the page-type catalogue (section 3.2): flags when the mount body creates a table plus toolbar (list), a form plus save (settings), tiles (dashboard) and so on, by the same tag/element mix heuristics as D1; message names the candidate page type. Wrong-guess risk is why this is a warning by default |
| P4 | Ad hoc page chrome next to `pk-app-shell`: hand-built header, side nav, breadcrumbs, footer beside or instead of `pk-app-shell`, `pk-navbar`, `pk-side-nav`, `pk-breadcrumb`, `pk-page-header` | warn | error | tag/class hints (`<header>`, `<nav>`, `.sidebar`, `.breadcrumb`) in a file that also mounts `pk-*` |
| P5 | Two page types mixed inside one route by hand: a `list` route that renders its own filter bar, pager, empty state or loading skeleton instead of the page type's config (`pk-empty-state`, `pk-skeleton`, `pk-pagination` and the `states` page type exist) | warn | warn | element-mix heuristic; strict keeps it a warning because the heuristic is the weakest |
| P6 | State and persistence bypass: `localStorage`/`sessionStorage`/`history.pushState`/`location.hash` in app code where `defineModule({ state })` and the router own them | warn | error | token scan (subset of S7, reported with a P-specific fix) |
| P7 | No error/empty/loading handling: a `list`/`record` route config without `empty`, `error` or `loading` (page-type states) | warn | warn | route config object scan for the page types' documented state keys (data from the page-type catalogue) |
| P8 | Unknown page-type id or config key in a route (typos, removed keys) | error | error | page-type catalogue check: a pure data comparison, low false-positive; exact with the parser option, best effort by regex without |
| P9 | Pages reached only by hand-written `href="#/..."` strings instead of module `nav`/`routes` and `ctx.navigate` | warn | warn | string scan for hash-route literals |

P8 is the only P rule that is an error in normal mode: it reports something that cannot work.

### 2.4 Family T: tokens and standards (owner goal 3)

| id | detects | normal | strict | how (static) |
|---|---|---|---|---|
| T1 | Literal colour in app CSS or style data: `#rgb`, `#rrggbb`, `rgb(`, `hsl(`, named colours in colour properties | warn | error | CSS/JS token scan (`literalColours` in `core/js/quality.js` is reused, made import-free by moving the regex into the shared scanner) |
| T2 | Literal size: `px`/`rem`/`em` lengths for spacing, radius, font-size; literal `z-index`; literal durations and easings | warn | error | (`literalSizes` from `quality.js`, shared) ; hints map the nearest token: `12px` to `--space-3`, `4px` radius to `--radius-sm`, by nearest value in the token list of `tokens/tokens.css` (section 3.3) |
| T3 | Font family or font-size literals outside the token set | warn | error | CSS scan; fix names `--font-*` and `--text-*` tokens |
| T4 | Overrides of a token in the app root that break contrast or remove focus rings: `outline: none` / `outline: 0` without a replacement, `:focus { outline: none }` | error | error | CSS scan; a data rule (the quality module's `focusRingSelectors` idea, static half) |
| T5 | Unknown token: `var(--x)` where `--x` is not in the token list nor declared in the app's own CSS (a typo of a token silently renders nothing) | warn | error | token list (section 3.3) plus a scan of the app's own custom property declarations |
| T6 | Unknown element: a `pk-*` tag that is not in the catalogue (typo) or an unknown attribute on a known `pk-*` element, and an enum attribute value outside the meta's allowed values | error | error | element manifest data; attribute checks limited to attributes with `values` in meta, so no false positive on data attributes |
| T7 | Deprecated or removed element/attribute (from the API baseline diff and element meta `deprecated`) | warn | error | data-driven; empty on day one, useful from the first deprecation |
| T8 | Size discipline for consumers: the app loads the whole element bundle when it uses a few elements (imports `plainkit/elements/elements.js` or all-in-one) | warn | warn | import scan against the dist layout; hint names the per-element modules. Info-grade |
| T9 | Hard-coded English in an app that declares a locale/RTL support level (dir or lang handling) | off | off | reserved, not in v1 |

### 2.5 Family A: accessibility attributes (owner goal 3, from element meta `a11y`)

| id | detects | normal | strict | how (static) |
|---|---|---|---|---|
| A1 | Icon-only `pk-button` (`icon` set, no text child) with no `label` and no `aria-label` | error | error | the rule stated in `pk-button` meta `a11y`: "Every icon-only button needs a name"; template scan of the element usage |
| A2 | Form controls (`pk-input`, `pk-select`, `pk-textarea`, `pk-checkbox`, `pk-radio`, `pk-switch`, `pk-combobox`...) with neither `label`, an associated `pk-field-row` label, nor `aria-label` | warn | error | per-element `requiresName` derived from element meta (section 3.4) |
| A3 | `pk-dialog`/`pk-drawer` without a title (`heading`/`label`), `pk-tabs` tab without text, `pk-frame`/iframe without `title`, `pk-image`/`img` without `alt` (decorative allowed as `alt=""`) | error | error | same derived table |
| A4 | Positive `tabindex` (`tabindex="1"` and up), `tabindex` on a non-interactive element without a role, click handlers on non-interactive tags (`<div onclick>`, `@onclick` on a `div`/`span`) | warn | error | tag and attribute scan; D1 already covers the tag, this reports the missing keyboard path |
| A5 | Heading order and single `h1`: skipped levels or several `h1` in one file/page | warn | warn | per file scan, warning only (composed pages span files) |
| A6 | Colour-only status: a `pk-badge`/`pk-alert` variant conveys state but no text child | warn | warn | element usage scan |
| A7 | Missing `lang` on the root HTML page, missing viewport meta, missing landmark `main` in a page shell that does not use `pk-app-shell` | warn | error | `.html` entry scan |
| A8 | Reduced-motion and target-size overrides removed by app CSS (`transition: none` is fine; `min-height: 0` on `pk-button` shrinking the 44px phone target, `animation` overriding `--duration-*` without `prefers-reduced-motion`) | warn | warn | CSS scan for the documented hooks; heuristic |

A rules are cheap because each element's meta already states its accessibility contract in prose (`a11y`); section 3.4 proposes the small structured field (`requiresName`) that makes them data, not one more hand-written list.

### 2.6 Family B: Blazor and Razor only

| id | detects | normal | strict | how |
|---|---|---|---|---|
| ~~B1~~ | Removed (issue #686): D1 ("a raw tag that has a pk-* equivalent") already runs against `.razor`/`.cshtml` through the same scanner, so B1 was a byte-for-byte duplicate of D1 on every finding - nothing here to keep. | - | - | - |
| B2 | `class=` / `style=` on markup and on `Pk*` components (`Class`/`Style` parameters if any) (S1 to S3 counterpart) | warn | error | Razor scanner |
| B3 | Unknown `Pk*` component or parameter (typo, removed parameter) | error | error | `blazor/mappings/*.json` (component and `params[].name`) |
| B4 | Page not deriving from the SDK's page base (`PageBase`) where the app uses page types | warn | warn | `@inherits`/`@page` scan, gated app-wide (issue #718): only runs on an app where some file already declares `@inherits ...PageBase` - real evidence the app opted into `PageBase`, not guessed per file |
| B5 | JS interop for a behaviour a component owns (`IJSRuntime` calls to `showModal`, `clipboard`, scroll-lock) | warn | warn | string scan, hint rule (D7 counterpart) |
| B6 | `<script>` or inline `onclick=` and inline `@onclick` on non-components (A4 counterpart), `MarkupString` with a non-literal value (S5 counterpart) | warn | error | Razor scanner |

Blazor rules T*, A* and P* apply to `.razor` through the same scanners (section 7); B rules exist where the Blazor surface differs.

## 3. Suggestions are generated from data, not written by hand

Every hint in a fix message (`use pk-table`, `use the list page type`, `use --space-3`) is looked up in a **generated data module** built by `core/tools/audit/data.mjs` at bootstrap time from sources that already exist. Nothing below is invented; where a source lacks a field, the field is added to the source, not hand-listed in the audit.

### 3.1 Elements: tag, alias and API hints

Source: `core/elements/*/*.meta.json` through `core/tools/element-manifests.mjs` and `core/dist/elements/api.json` (what `scripts/build-skills.mjs` already reads).

| hint | derived from |
|---|---|
| raw tag to element (`button` to `pk-button`, `table` to `pk-table`) | a new optional meta field `replaces: ["button", "a[role=button]"]` (each element declares the native tags and roles it replaces; validated by `element-api.mjs` like `aliases`). Missing on day one, filled in the same pull request that adds the field, covering the ~30 elements with a native counterpart |
| class-name to element (`.modal` to `pk-dialog`) | element tag minus prefix, plus `aliases[]` (#459: already declared for `pk-dialog`, `pk-drawer`, `pk-dropdown`, `pk-toast-stack`; the audit is one more consumer of that field, and a reason to add more) |
| API to element (`showModal`, `clipboard.writeText`) | the same `replaces` field with API names (`"api:showModal"`) |
| element to docs link | gallery URL of the element; the same anchor the skills' `elements-index.md` uses |
| element to attributes and allowed values (T6) | `props[]` of meta (`name`, `type`, `values`) |
| CSS hooks and parts (D8) | `cssProperties[]` and `parts[]` of meta |

### 3.2 Page types

Source: `core/js/app/pages/*.js` (12 built-in page types: `custom`, `dashboard`, `doc`, `list`, `master-detail`, `not-found`, `record`, `settings`, `states`, `tool`, `wizard`, `workspace`) and the API baseline.
Proposal: each page-type file (or its element's meta) exports a small `PAGE_TYPE` descriptor already implied by its config validator: `{ id, summary, configKeys, states, useWhen }`. `useWhen` is one sentence
("a collection the user filters, sorts and opens: table plus toolbar plus row actions") used verbatim in the P3 hint and in the skill's page-type chooser. P7 reads `states`, P8 reads `configKeys`.
If the owner prefers no new export, the descriptor lives in the page types' meta JSON (Q5).

### 3.3 Tokens

Source: `core/tokens/tokens.css`, parsed at build time into `{ name, value, group }` (`--color-*`, `--space-*`, `--text-*`, `--radius-*`, `--shadow-*`, `--duration-*`, `--ease-*`). T2 finds the nearest token by value within the same group
(numeric distance in px after rem conversion at 16px; colours by token name only, no nearest-colour guess, since a wrong colour suggestion is worse than none). The list also feeds T5 (unknown token).

### 3.4 Accessibility requirements

Source: per-element meta `a11y` prose today. Proposal: one small optional structured field `a11yRequires: ["name"|"label"|"title"|"alt"]` in meta (validated by `element-api.mjs`), authored once per element beside the prose, feeding A1 to A3 and rendered into the skills. The prose stays the human explanation and is quoted in the FIX message.

### 3.5 Rule text

Each FIX message is a template in the rule table with slots (`{file}`, `{line}`, `{found}`, `{element}`, `{attrs}`, `{docs}`), for example:

- D1: `FIX: {file}:{line} writes <{found}>. PlainKit already ships {element}: use <{element}{attrs}>. {docs}. If a real gap remains, file it under #336; do not keep a copy.`
- D3: `FIX: {file}:{line} wires raw pointer drag. pk-splitter (resize) and pk-sortable/pk-kanban (reorder) own this; compose one, or allow-list this file with a reason.`
- P3: `FIX: {route} mounts hand-built DOM with {mix}. The "{pageType}" page type is for this: {useWhen}. Use { page: '{pageType}', config } and see {docs}.`
- T2: `FIX: {file}:{line} uses {found}. Use var({token}) (nearest: {value}). Tokens live in tokens/tokens.css; do not add a literal.`
- A1: `FIX: {file}:{line} <pk-button icon> has no name. Add label="..." (it is the accessible name and the tooltip).`

All messages end with the rule id in brackets, `[D1]`, the same string the skills use as a heading anchor.

## 4. How it detects: no-dependency scanners first, an optional parser second

Constraint: the `plainkit` package is dependency-free ("no dependencies" is a headline property, `core/package.json`), and `core/tools/*` uses text scans throughout (`security.mjs`, `composition-audit`). The audit runs from `node_modules/plainkit`, so any runtime dependency would be installed into every consumer.

### 4.1 Scanners (v1, no dependencies)

One scanner per file kind, all hand-written, each returning `[{ kind, name, attrs, line, col }]` plus raw tokens, so rules are written against a uniform structure, not against regexes:

- **HTML/razor/vue-template/svelte-markup**: a tolerant tag tokenizer (open tag, attributes with quote handling, `<!-- -->`, `<script>`/`<style>` raw-text bodies, `@`-expressions and `{...}` skipped as opaque). About 150 lines. Razor adds: `@code`, `@{ }` and `@( )` blocks skipped, component tags recognised by an uppercase or `Pk` prefix.
- **JS/TS/JSX/TSX**: a comment-and-string-aware tokenizer (regex literals, template literals with `${}` nesting, JSX text treated as markup and re-fed to the tag tokenizer). It gives identifiers, member chains and string contents, which is what S2, S5, S7, D3 to D7, T1 to T3 need. About 200 lines.
- **CSS**: a small tokenizer (comments, strings, `{}` nesting, `@media`/`@layer`/`@supports` recursion, declaration splitting). About 100 lines. Same approach as `unusedSelectors` and `literalColours` in `quality.js`.

Comments are stripped first (the internal audits do the same), string contents are kept because most signals are in strings (`'<div>'`, class names).

### 4.2 Honest limits

Text scanning can miss a hand-built tag assembled by concatenation, computed class names, or markup built in a helper elsewhere; it can also over-report (a doc string containing `<button>`). The audit is a guardrail for developers and agents, not proof of conformance and not a security check; the README section and the CLI footer say so. Rules that depend on inference (D2, D9, P3, P5) are warnings in normal mode and in strict mode P5 stays a warning. A rule may not be an error unless its false-positive rate on the fixtures (section 10) is zero.

### 4.3 The optional parser (answering the owner's open question, Q6 in #515)

Options:

| option | description | verdict |
|---|---|---|
| A. No parser, ever | scanners only | works for D1 to D9, T, A, most P; P2/P8 and route-shape checks are best effort |
| B. Runtime dependency on a parser (acorn, htmlparser2) | installed into every consumer | **rejected**: breaks the "no dependencies" property of the package and adds supply-chain surface for every user |
| C. **Optional peer, not installed by us**: `plainkit audit` uses `acorn` (and `typescript` for `.ts`) *if the consumer's project already resolves it*, and reports "exact mode" in the header; otherwise scanners only ("approximate mode") | zero cost by default; consumers that already have TypeScript or a bundler (almost all) get exact route-config checks | **recommended** |
| D. Dev-only dependency of this repo, used to generate more precise scanners | no benefit to consumers | not useful |

Recommendation: A for v1, and design the scanners' output structure so C is a drop-in later: a rule that needs an exact answer declares `needs: 'ast'` in its table row, and in approximate mode it is skipped (not guessed) and listed in the "skipped rules" footer with the reason. P2 and P8 are the first such rules; until C exists they run as best-effort text checks and are labelled "approximate" in the output. Whether to implement C at all is Q6.

## 5. CLI design

### 5.1 Command and output

`plainkit` gains a `bin` entry, `plainkit` pointing at `dist/tools/audit/cli.mjs` (the file ships in `dist/`, because `files` is `["dist", ...]`; a shebang `#!/usr/bin/env node`, ESM). Subcommands: `audit` (this design), and the name leaves room for `plainkit init`/`check` later without a second package.

```
npx plainkit audit [paths...]            paths default: config "include", else the project root minus ignored folders
  --strict                                the consumer-strict ruleset (section 6)
  --format text|json|sarif                default text; json and sarif for CI and code scanning
  --rule D1,T2 / --skip P9                 select by id or family prefix (D, P, T, A, B, S)
  --config <file>                         default plainkit.audit.json found upward from the cwd
  --baseline <file>                       default plainkit.audit.baseline.json; --update-baseline writes it (section 5.3)
  --max-warnings <n>                      fail when warnings exceed n (-1 = no limit, default)
  --explain <id>                          print the rule: what, why, fix, docs, examples (rendered from the same table)
  --list-rules                            table of ids, category, normal/strict severities
  --quiet, --no-color, --version
```

Text output (one finding per block, sorted by file then line, the FIX line last and stable so an agent can grep it, the id in brackets):

```
src/pages/Orders.js:42:9  warn  [D1]  <table> duplicates pk-table
  FIX: src/pages/Orders.js:42 writes <table>. PlainKit already ships pk-table: use <pk-table columns=... rows=...>. https://.../elements/pk-table. If a real gap remains, file it under #336; do not keep a copy.

plainkit audit: 3 errors, 17 warnings, 212 files, 0.4 s (approximate mode; 2 rules need a parser: P2, P8)
```

JSON: `{ version, mode: "normal"|"strict", parser: "none"|"acorn", findings: [{ id, category, severity, file, line, column, message, fix, docs, suppressed?: "baseline"|"allow" }], summary, skipped }`. SARIF 2.1.0 with `ruleId`, `level` (error/warning/note), `physicalLocation`, and the rule table rendered into `tool.driver.rules` (so GitHub code scanning shows the fix text).

### 5.2 Exit codes

`0` clean (or only non-failing findings); `1` at least one failing finding (error, or a warning over `--max-warnings`); `2` usage or config error (unknown rule id, malformed config, an allow entry without a reason); `3` internal error (a scanner threw: reported with the file, never silently skipped, consistent with the "no silent failure" rule).

### 5.3 Configuration, allow-list and ratchet

`plainkit.audit.json` (JSON, no dependencies to parse, schema documented and validated with the same hand-written validator style as `security.allow.json`):

```json
{
  "include": ["src/**", "wwwroot/**"],
  "ignore": ["**/*.generated.*", "**/vendor/**"],
  "strict": false,
  "options": { "allowCss": ["src/app.css"], "allowClasses": ["u-*"], "imports": ["@plainkit/core", "./lib/**"] },
  "rules": { "P9": "off", "T8": "warn" },
  "allow": [
    { "rule": "D3", "path": "src/legacy/drag.js", "count": 1, "reason": "Custom timeline scrubber until pk-timeline exists.", "issue": "https://github.com/acme/app/issues/12" }
  ]
}
```

- `allow` entries mirror `composition.allow.json`/`strict.allow.json`: **`reason` required (at least 20 characters)**, a tracking reference required (`issue` or `until`), and `count` exact: fewer real hits than `count` fails ("lower the count"), more fails, so an allow entry can only shrink. An entry with no matching hit fails (dead entry). This is exit code 2 if malformed, exit 1 if stale. Inline suppression comments (`plainkit-audit-ignore D1 -- reason`) are supported for one line with a required reason, counted in the summary, and listed by `--list-suppressions`; they are allowed in both modes. (Q7: is inline suppression wanted, or only the file?)
- **Baseline (ratchet):** `--update-baseline` writes `plainkit.audit.baseline.json`: `{ rule, file, fingerprint }` per finding, the fingerprint a hash of rule id + normalised offending text + the file path (not the line number, so moving code does not resurface it). A run fails only for findings not in the baseline; a baseline entry that no longer occurs is reported as "fixed: remove it" (info; `--strict-baseline` makes stale entries fail so the baseline can only shrink). This lets an existing app adopt the audit on day one with CI green and tighten forever. Rules of the config file also hold in CI: the baseline file is committed.
- Config errors name the file and key, and print a FIX line.

### 5.4 Autofix: none by default

`--fix` is **not** shipped in v1. The rules propose replacements, but a `<button>` to `<pk-button>` rewrite changes event wiring, styling and accessibility, and a wrong autofix is worse than a finding. Design of the only safe candidates, for a possible v2, each individually opt-in (`--fix D1-simple`) and previewed with `--fix --dry-run` as a diff:

1. `<hr>` to `<pk-divider>` and `<progress value max>` to `<pk-progress value max>`, when the tag has no class, style or unknown attributes;
2. adding `label` from an existing `title`/text on an icon-only `pk-button` (A1) when both are static strings;
3. removing a dead allow entry or lowering a `count` in the config (`--update-allow`), which touches only the audit's own file.

Everything else is a suggestion. Decision needed: Q4.

### 5.5 Performance

Budget (estimates, to be measured in the CLI PR): a 500-file app in under 1 s and a 5,000-file app in under 5 s on a laptop, single-threaded, since each file is tokenised once and every rule reads the shared token structure (a rule never re-tokenises). Files over 1 MB and minified files (a line over 5,000 characters, `.min.`) are skipped with a note. Files are read as UTF-8, paths sorted for deterministic output. `node_modules`, `dist`, `bin`, `obj`, `.git`, `coverage`, `.next` and build outputs are ignored by default. No worker threads or caching in v1; a `--changed <git ref>` mode (only files changed against a ref) is the CI speed-up (Q8).

### 5.6 CI usage

```yaml
- run: npx plainkit audit --strict --format sarif > plainkit.sarif   # or --format json
- uses: github/codeql-action/upload-sarif@v3
  with: { sarif_file: plainkit.sarif }
```

Adoption path documented: `npx plainkit audit --update-baseline` once, commit the baseline, run `npx plainkit audit --strict-baseline` in CI, and delete baseline lines as they are fixed. Also `npx plainkit audit --changed origin/main` for pull requests.

### 5.7 Supported file set for v1

Supported: `.html`, `.htm`, `.js`, `.mjs`, `.jsx`, `.ts`, `.tsx`, `.css`, `.razor`, `.cshtml`. Deferred to a v1.1 (their script and template blocks reuse the same scanners, but SFC extraction and framework template syntax such as `v-if`, `{#each}` need their own fixtures): `.vue`, `.svelte`, `.astro`, `.md`/`.mdx`. Not supported: `.scss`/`.less` (preprocessor syntax; reported as "skipped: unsupported" so a user does not think it was scanned), `.cs` code-behind (only its Razor partner is checked; B5 reads `@code` blocks in razor), and generated or minified output. Q3 asks whether Vue and Svelte are needed for v1.

### 5.8 Monorepo and multi-project layouts

The config is found upward from the cwd and may declare `projects: [{ name, root, include, options }]`, each with its own options and baseline; the CLI audits each and merges output, with `--project <name>` to select one. Paths in findings are relative to the config file. A `.razor` project and a JS project in one repo are two projects, so the Blazor skill's options (B rules) apply only to the first. Root detection uses `package.json` and `*.csproj`; no globbing library, since the glob subset (`**`, `*`, `?`, `{a,b}`, negation) is about 60 lines to write.

## 6. Strict mode

**Definition: `--strict` (or `"strict": true` in the config) applies the strict-module rules of #515 to the whole app**, so the app's view layer is only `pk-*` elements (or components composed of them), with no CSS, class, style attribute, raw standard tag, HTML sink, custom page or literal design value outside the allow-list.
The result is what `core/samples/app` already is: `core/tests/app-shell.test.mjs` proves that demo carries no consumer CSS, style or class.

What changes between the modes, in one line each:

- Normal mode is advice: family D, P (except P8), T and most A findings are warnings; a real defect that cannot work (T4 removed focus ring, T6/B3 unknown element, P8 unknown page type/key, A1/A3 missing names) is an error in both.
- Strict mode promotes the strict-module rules (S1, S2, S3, S4/D1, S5, S8/P3, S9/T1-T3) and their duplicates D2 to D9, P1, P2, P4, P6 to errors, and turns `imports` (S6) on for the names the config declares.
- What **stays a warning even in strict**: S7 (direct platform access; the app's bootstrap legitimately needs it), D7 and B5 (API-usage hints), P5, P7, P9 (heuristics or advice), A5, A6, A8 (heuristic), T8. A rule stays a warning when a reliable fix cannot be produced from data or the detector infers intent.
- What is **off in both modes in v1**: S10 (anatomy), S11, S12, T9. S10 is available as `--anatomy` for apps that follow the module layout.

Strict is opt-in per project because most existing apps will have hundreds of class uses; the baseline (5.3) is how they get there: strict plus a baseline means "no new violation ever", and the strict engine's ratchet (`count` only decreases) does the rest.

Strict mode and modules: when the config names module roots (`"modules": ["src/modules/*"]`), the module ruleset of #515 (with S10 and the module import boundary S6 exactly as specified there) applies to those folders, and the consumer-strict ruleset to the rest of the app. Without `modules`, the whole app is one consumer-strict unit. This keeps one engine and three rulesets: `module`, `consumer`, `consumer-strict`.

## 7. The Blazor skill and Razor markup

- The `plainkit-blazor` skill documents the same rule ids with Razor examples: `<button>` to `<PkButton>`, `class="modal"` to `<PkDialog>`, `<table>` to `<PkTable>`. The rule table carries per-language example snippets (a `examples: { html, razor }` slot) rendered into the matching skill; the same rendering step keeps it identical to `--explain` output for `.razor`.
- Component names and parameters come from `blazor/mappings/*.json` (`component`, `params[].name`, `prop`) which is already the source of truth for `scripts/generate-blazor.mjs` and the skills, so B3 (unknown component or parameter) and the `Pk*` hint (`button` to `PkButton`) are data lookups. The element-to-component mapping is the mapping's `component` field for the element; no new file.
- Razor scanner: the HTML tag tokenizer of section 4.1 with Razor awareness: skip `@* *@` comments, `@{ }` and `@code { }` blocks (but hand their contents to the JS/C#-agnostic token scan for D7/B5 API names and `MarkupString`), treat `@expr` and `@(expr)` in attribute values as opaque (an attribute whose value contains `@` is never flagged as a literal), treat `<Pk...>` tags as components, and `<text>` as transparent. `.cshtml` uses the same scanner plus tag helpers (`asp-*` attributes are ignored, not flagged).
- In `@code` blocks C# is not parsed; B rules do not run on C#. C# `RenderTreeBuilder` code that emits raw elements (`builder.OpenElement(0, "div")`) is caught by a narrow regex (`OpenElement\(\s*\d+\s*,\s*"(div|span|...)"`), warning B1.
- A Blazor consumer shares the CSS, token and a11y rules through the same CSS and markup scanners. B rules are hints for what the Blazor surface changes; T/A/D/P rules apply to Razor markup as they do to HTML.
- Strict for Razor: only `Pk*` components and the app's own components under `Components/` (the Razor counterpart of the module anatomy in #515 section 3.7); no `class`, no `style`, no raw tags. Open question Q8 of #515 (mirror the module anatomy for Razor) is unchanged; the audit only needs the tag rule and does not depend on its answer.
- The CLI is a Node program, so a .NET consumer runs it with `npx plainkit audit` (Node is already required by their asset build) or as a pre-build MSBuild target; the package does not add a .NET tool (Q10).

## 8. Where the rules live in the skills

`scripts/build-skills.mjs` gains, from the same table:

- `references/conformance-rules.md` in both skills: the rule catalogue (id, category, normal/strict severity, what it detects, why, the wrong and right snippet, the docs link), sorted by family;
- a "Check your work" step in each `SKILL.md` workflow (`scripts/skills/<skill>/SKILL.md`): "before you finish, run `npx plainkit audit --strict` and fix each finding by its rule id; a finding that is a real SDK gap goes to #336 or the app's own tracker, never a workaround", and, for an agent that cannot run Node, the top 10 rules inline as a checklist;
- the page-type chooser table (from section 3.2 `useWhen`) which the skill lacks today and P3 needs.

`scripts/tests/skills.test.mjs` already verifies every code sample in the skills; the wrong/right snippets in the table are run through the audit itself (a test asserts the "wrong" snippet produces exactly its rule id and the "right" snippet produces none), so the documentation cannot describe a rule the engine does not implement.

## 9. Dogfooding

- `core/samples/app` **must pass `--strict` with zero findings and no allow entries** (it is the reference consumer, and `app-shell.test.mjs` already forbids consumer CSS there). A node test runs the engine over it. Its `page.js` builds `h1` and `dt`/`dd` by hand today (the strict-modules design lists this as its first two gaps); until `pk-heading` and the data-driven field list land, the sample either carries two counted allow entries pointing at those issues or the PR that lands the CLI waits for them. Stated plainly so the acceptance criterion is not silently weakened: the criterion is zero, and the two entries are temporary pins with issue numbers.
- Site V2 (`core/site2/`, #515) passes the `module` ruleset in `core/tests/strict-modules.test.mjs`, and the same files run through `consumer-strict` in one extra assertion, proving the two rulesets agree on the S rules (a rule that reports in one and not the other is a bug).
- `core/samples/patterns` and `core/samples/templates` run in normal mode as a regression check, and `blazor/samples/PlainKit.Playground` runs the Razor scanner in a nightly-style test (not in the required set, see below), which will reveal real false positives on real markup.
- The internal composition audit and the existing `composition.allow.json` stay; `composition-audit.test.mjs` imports the shared D3 to D6 scanner from `core/tools/audit`, so there is one implementation.
- The Blazor Playground and Wasm playground are also real fixtures for B rules.

## 10. Testing

- **Rule tests (permanent, in-memory):** each rule has a table-driven test with `{ files: [{ path, text }], expect: [{ id, line, severity }] }` for the wrong snippet, plus a right snippet expecting none. Because the engine is pure this needs no fixtures on disk and is the "fails on a deliberately added violation" evidence.
- **Fixture consumer apps** in `core/tests/audit-fixtures/<name>/` (small: about 8 files each): `plain-html` (a hand-rolled modal, table and tabs: expects D1, D2, D6), `js-app` (a `mountApp` shell with a `custom` page and `localStorage`: P3, P6), `strict-clean` (a copy of the demo shape: zero findings), `blazor-app` (razor with raw tags and a typo: B1, B3), `messy-css` (literal colours, `outline:none`: T1, T2, T4), plus one **false-positive fixture** per detector family (documentation strings containing `<button>`, a class named `.card` in a print stylesheet, a `keydown` for Escape only) that must produce nothing. Fixtures are markup and JS text, never executed.
- **Snapshot outputs**: the text, JSON and SARIF for each fixture are committed and diffed by a test (`scripts/tests/audit-cli.test.mjs`), so output changes are deliberate; the SARIF output is validated against the required fields of the schema by a small structural check (no schema dependency).
- **Config and ratchet tests**: malformed config exits 2; allow entry without a reason exits 2; stale `count` exits 1; the baseline suppresses old findings, fails on a new one, and moving a line does not change the fingerprint.
- **Parity tests**: the rule table, `--list-rules`, `--explain`, and `references/conformance-rules.md` agree (section 1); fix templates reference only catalogue elements and existing token names; every `replaces` and `aliases` entry resolves to an element.
- **Performance test**: a generated 2,000-file tree is scanned under a loose time bound in a non-required check (a required time-based test would flake; the same reason the browser job is not required).
- **Verify integration**: one `audit` entry in the `CHECKS` table of `scripts/verify.mjs`, group `node` (rule tests, fixture snapshots, dogfood on the demo app), with a FIX line, `run node --test scripts/tests/audit-cli.test.mjs and fix the rule or the fixture, never the expectation`. No new job, no new required workflow.

## 11. Size, release and versioning implications

- **New public CLI surface.** The `plainkit` package gains `bin`. That is public API: the command name, the subcommand, flags, exit codes, output formats (JSON and SARIF shapes), the config schema, the rule ids and their meanings, and the baseline file format. Rule of stability: **rule ids and meanings never change within a major**; adding a rule is a minor (in normal mode it is a warning by default, so a new rule cannot break a CI that was green); promoting a rule to error in normal mode, changing an exit code or removing an id is a major. Severity changes in strict mode are a minor with a changelog entry, because strict is opt-in, but are called out. The audit gets its own line in the API baseline (`core/tools/api-surface.mjs`): CLI flags, exit codes, rule ids, config keys, JSON top-level keys, so `versioning.mjs bump` reports the version a change needs.
- **A rules-version** field in the JSON output and in the baseline file lets a baseline made by an older ruleset be read and migrated (or refused with a FIX line), so a minor never invalidates it.
- **Package size.** The CLI ships in `dist/tools/audit/` (scanners about 500 lines, rules about 900 lines, generated data tables). Estimate, not measured: 25 to 35 KB uncompressed, 8 to 12 KB gzip, on top of the package, never loaded by page code, and not part of any page or element size budget (the budgets, including the page layer's 10 KB gzip, are untouched and are not raised). The `pack` job's `scripts/check-package.mjs` gains an assertion that the CLI, the rules data and the skills reference are present and that no page bundle imports them.
- **`core/package.json`** adds `"bin": { "plainkit": "dist/tools/audit/cli.mjs" }` and the tool is built by `core/tools/build.mjs` into `dist/`. Two owner points: the package name is `plainkit` (unscoped) so `npx plainkit` works; and there is a `bin` name collision risk to check on npm before release (Q1).
- **Engine placement.** The engine and rules also live outside `dist` for this repo's own tests; the build copies them, so there is one source. It must not import anything from `core/js`, `core/elements` or `core/site`, or the "pure, no repository paths" property of #515 breaks (a test walks the import graph of `core/tools/audit` and `core/tools/strict`).
- **Blazor package.** The NuGet package does not ship the CLI. Its skills reference documents `npx plainkit audit` and the Razor rules; the package check asserts the skill references are present, as it does for the skills today.
- **Release.** No behaviour change to any element or page type; a `added` changelog fragment per implementation PR; a release when the engine, CLI and docs generation are merged (a batch worth shipping, per the cadence in `AGENTS.md`). The CLI is `alpha` (documented as such) until the false-positive rate on the dogfood set is measured; `0.x` already allows this.
- **Generated files** stay uncommitted (`core/dist/**`, generated hint data); the fixtures' snapshots are source, not generated.
- **Privacy.** The CLI makes no network call, sends no telemetry, and prints no absolute path (paths are relative to the config); the docs link in a FIX line is a fixed string, not fetched.

## 12. Implementation breakdown (small releasable PRs, each at or under about 400 hand-written lines, one issue each)

| PR | scope | depends on | est. lines |
|---|---|---|---:|
| A-0 | this design (docs) | none | docs |
| A-1 | engine work already scheduled as V2-1 (#515): `core/tools/strict/engine.mjs` with S1 to S9. Audit additions here: rule `meta` slot, `ruleset` options plumbing, scanners for html/js/css (tokenizers only), unit tests | V2-1 of #515 | 380 |
| A-2 | rule table and FIX templates for S and D families, the shared D3 to D6 scanner (the composition audit test switches to it, behaviour identical), per-rule tests | A-1 | 380 |
| A-3 | data build (`data.mjs`): meta fields `replaces` and (if approved) `a11yRequires`, `elements` hint tables from manifests, token list, page-type descriptors; validation in `element-api.mjs`; docs for the fields | A-2 | 300 |
| A-4 | families T and A (tokens, standards, a11y) from that data | A-3 | 380 |
| A-5 | CLI: arg parsing, file walk with the glob subset, text and JSON output, exit codes, config validation, `bin`, `--list-rules`, `--explain`; `verify.mjs` entry | A-2, A-4 (any rules can be included: the CLI can ship with S and D only) | 390 |
| A-6 | allow-list with reasons and ratchet counts, baseline and fingerprints, inline suppressions, SARIF output, `--max-warnings` | A-5 | 380 |
| A-7 | family P (page types and app structure) and the page-type chooser data | A-3, A-5 | 350 |
| A-8 | docs generation: rule table rendered into both skills (`conformance-rules.md`, "Check your work"), docs site page, the rule/skill parity test, wrong/right snippet test | A-2 (grows with each family) | 350 |
| A-9 | Razor scanner and family B, using `blazor/mappings`, the Blazor skill examples | A-5, A-8 | 380 |
| A-10 | dogfood and fixtures: `core/samples/app` passes strict, fixture apps and snapshots; packaging assertions in `check-package.mjs`; API baseline lines for the CLI; release notes | A-6, A-7, A-9 | 350 |
| A-11 (optional) | optional parser mode (approach C) for P2/P8 exactness | A-7, Q6 | 300 |
| A-12 (optional, later) | `.vue`/`.svelte` extraction, `--changed`, safe `--fix` candidates | A-10, Q3, Q4, Q8 | each separate |

Order and why: engine first (it is also needed by Site V2 and has no user-visible effect), then the rules and their data, then the CLI (the first user-visible surface, useful with S and D alone), then ratchet and SARIF (needed for adoption in CI), then P, docs generation and Razor, then the dogfood gate. A-3 and A-4 can run in parallel with A-5 after A-2. A-8 grows: each family PR adds its section to the table and the parity test keeps the docs in step, so the docs are never a big-bang PR at the end.

## 13. Interaction with existing issues

| issue | note |
|---|---|
| #346 (app framework tracker) | this is Q7 of #515 answered with a plan; P rules assert the framework's own page-type and module vocabulary |
| #336 (components the SDK lacks) | every "no element for this" finding says file under #336; the audit is the source of demand data (an allow entry naming a gap is a count of consumers waiting) |
| #515 / V2-1 to V2-3 | engine and allow-list/ratchet shared; audit PRs depend on V2-1 only, and reuse V2-3's allow/ratchet format (the consumer config's `allow` entries use the same fields) |
| #362 (framework enforcement) | independent; the audit does not touch `core/js/app` budgets |
| #459 (aliases) | the alias field is a data source for D2; more aliases improve detection |
| #363 (docs, build-an-app guide) | teaches `npx plainkit audit`; the strict section in #515 gets a link to this one |

## 14. Open questions for the owner

- **Q1. Name and packaging.** Ship the CLI as a `bin` of the existing `plainkit` package (`npx plainkit audit`), or a separate `@plainkit/audit` package? A separate package keeps `plainkit` free of executables but doubles the release steps. Also confirm the name is free on npm.
- **Q2. Strict severity of the D and P families.** Is "every D, S and most P rules are errors in strict" right, or should D2, D9 and P3 stay warnings because they infer intent? (This design keeps P5 as a warning and all other inferences as errors only in strict.)
- **Q3. v1 file set.** `.html`, `.js`/`.ts`/`.jsx`/`.tsx`, `.css`, `.razor`, `.cshtml`: is Vue and Svelte needed in v1, or acceptable at v1.1?
- **Q4. `--fix`.** Confirm no autofix in v1, and decide whether the three safe candidates of 5.4 are wanted later or never.
- **Q5. New data fields.** Approve the optional meta fields `replaces` and `a11yRequires`, and a page-type descriptor (`useWhen`, `configKeys`, `states`) in the page types or their meta, as the sources of suggestions. The alternative (hand-written tables in the audit) is the drift risk this design exists to avoid.
- **Q6. Parser.** Stay dependency-free with scanners only (this design's v1), or add approach C (use `acorn`/`typescript` if the consumer already has it) later for P2/P8 and route-shape exactness? Approach B (a runtime dependency) is recommended against. This restates Q6 of #515 for the consumer case.
- **Q7. Inline suppressions.** Allow `plainkit-audit-ignore RULE -- reason` comments in source, or only config-file allow entries (a central place, harder to scatter)?
- **Q8. `--changed` and monorepo projects.** Needed in v1 or later? (Design: later, except the `projects` config, which is needed for mixed JS and Blazor repos.)
- **Q9. Rendered audit.** Should `plainkit audit` later accept a URL and run the scorecard's rendered a11y/layout checks (`core/js/quality.js`) through a headless browser the consumer supplies? It needs a browser dependency the package must not carry; a possible optional integration.
- **Q10. .NET tool.** Is `npx plainkit audit` enough for Blazor consumers, or should the NuGet package also offer a dotnet tool or an MSBuild target that runs it?
- **Q11. Alpha stability.** Is it acceptable to call the CLI and rule ids alpha for the first release (severities and ids may change before 1.0), with the stability rules of section 11 starting at the first non-alpha release?
- **Q12. Dogfood gate and the sample.** `core/samples/app` must pass strict with zero findings: confirm the two temporary pinned entries (heading and field list gaps) are acceptable for the first CLI release, or hold the release until those elements land.
- **Q13. Reporting to this repository.** No telemetry is in the design; an opt-in `--share-gaps` that prints a ready-to-file #336 issue body for the gaps the audit found is proposed as a later convenience. Wanted?

## 15. Verification of this document

- Read in the repository: `core/tests/composition-audit.test.mjs` and `core/tools/composition.allow.json` (regexes and the allow shape reused for D3 to D6), `core/js/quality.js` (exports `literalColours`, `literalSizes`, `focusRingSelectors`, `accessibleName`), `core/tools/security.mjs` and `security.allow.json` (counted allow-list), `scripts/verify.mjs` (the `CHECKS` table with `fix` strings, rendered into `AGENTS.md`), `core/package.json` (`files: ["dist", "!dist/modules", ...]`, no dependencies, no `bin` today), `scripts/build-skills.mjs` (generates `core/dist/skills/` from `api.json`, `blazor/mappings` and `scripts/skills/<skill>/SKILL.md`), `core/js/app/pages/*.js` (the 12 page types listed in 2.3 and 3.2), `blazor/mappings/*.json` (`component`, `params[].name`), `core/elements/button/button.meta.json` (the `a11y` prose quoted in A1; meta keys `tag,title,group,summary,props,slots,events,parts,cssProperties,methods,a11y,examples`; no `replaces` or `a11yRequires` field exists today, so 3.1 and 3.4 propose them), PR #515 (merged) and #459 (`aliases[]` field for `pk-dialog`, `pk-drawer`, `pk-dropdown`, `pk-toast-stack`).
- Not measured: package size, CLI speed, scanner line counts, false-positive rates, PR sizes and the count of elements with a native counterpart. They are estimates and are labelled as such. Rule counts: 40 new rules (D 9, P 9, T1 to T8, A 8, B 6) plus the S family retained from #515, as listed in section 2.
- Nothing was implemented or run against a consumer app; no result in this document comes from executing the proposed CLI.
