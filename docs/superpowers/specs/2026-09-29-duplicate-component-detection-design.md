# Duplicate-component detection: a new audit rule, not a new tool (#653)

## Why

Issue #653: a consuming app writes its own component before a native `Pk*` equivalent exists (or without knowing one exists), and the duplicate goes undetected for a long time. The concrete example: Backend.Web's `AppField.razor` (a `dt`/`dd` term-value pair: `Label`, `Value`, `ChildContent`, `When`, `SkipEmpty`) shipped before `PkFieldListRow` existed, then sat unmigrated for multiple releases, found only by a manual full-file-read agent audit against the skill's reference docs.

The issue proposes "something in PlainKit's own tooling (CLI, analyzer, or a devtools tab)" and suggests a Roslyn-based structural-similarity check. This document evaluates that suggestion against what already exists, and recommends something narrower: **one new rule inside the `plainkit audit` CLI already designed in `docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md` (#629), using a text-scan heuristic, not Roslyn.**

**Scope note added after the first draft (owner direction):** this isn't only a consuming-app-vs-package problem. The same maturity concern — a pattern quietly re-implemented instead of reused — applies inside this repository's own `core/` source too (two elements independently reinventing the same small utility), and to a broader "rule of three" escalation (custom → centralized → modularized), not just full-component matching. Sections 6 and 7 address both, added as their own clearly-scoped additions rather than folded into the Blazor-specific design in sections 1–5.

## Non-goals

- Not a general "find any duplicate C# code" tool in v1 — the tractable v1 (B7, D10) is a consuming app's or the SDK's own UI component versus a known catalogue of components, not arbitrary code. See section 7 for why full generality is explicitly deferred.
- Not exact-match detection (renaming `Label` to `Heading` should still be caught) and not a guarantee (a coincidental two-parameter overlap must not fire).
- Not a fix or codemod. The rule points at the candidate and the matching `Pk*`/`core/elements` component; migrating is the app's (or the SDK's own) change to make.
- **Sections 1–5 (B7) target Blazor/Razor only**, matching the issue's own example and the only place PlainKit ships strongly-typed component parameters today. **Section 6 (D10) extends the same underlying comparison to the vanilla/JS side, scoped specifically to `core/`'s own element catalogue**, not to arbitrary consuming JS apps — a vanilla consumer composes `pk-*` elements directly rather than declaring parallel component APIs the way a Blazor consumer's own `.razor` components do, so there is no vanilla-consumer-facing equivalent of B7 today; the vanilla-side problem this document addresses is internal (core catching itself), not external (a JS app catching itself).

## 1. What already exists (read in full before designing this)

### 1.1 The conformance-audit CLI (#629, #518, #515)

`core/tools/audit/` is a pure, dependency-free Node engine (`core/tools/strict/engine.mjs`) plus a rule table (`core/tools/audit/rules.mjs` = `[...S_RULES, ...D_RULES, ...T_RULES, ...A_RULES]`, one file per family under `families/`). Each rule is `{ id, category, detects, severity: { normal, strict }, docs, fixTemplate, applies, scan }`. `scan` returns hits; the engine turns them into findings; `cli.mjs` (`plainkit audit`) walks a consumer's own source tree (`SUPPORTED_EXTENSIONS` already includes `.razor` and `.cshtml`), runs the rules, and prints text or JSON (`format.mjs`).

Every hint the rules print is **looked up in generated data**, never hand-written: `core/tools/audit/data.mjs` builds `core/tools/audit/generated.data.mjs` from `core/elements/*/*.meta.json`, `core/js/app/pages/*.js` and `core/tokens/tokens.css` at bootstrap time, and `hints.mjs` is the only thing the rule families import from it. This module is explicitly barred from importing anything under `core/js`, `core/elements` or `core/site` at runtime (it only reads those paths at *build* time, in `data.mjs`) — "the pure, no repository paths property of #515" — because the CLI ships inside the `plainkit` npm package and runs from a consumer's `node_modules`, with no access to this repository's source.

**Family B (Blazor and Razor only) is already designed but not yet implemented.** Section 2.6 of the #629 design lists B1–B6; none of them is "own component looks like a `Pk*` component." B3 ("unknown `Pk*` component or parameter") is the closest existing rule, and it is an *exact*-match rule against `blazor/mappings/*.json` (a consumer's own use of `<PkFoo Bar="...">` where `Bar` doesn't exist) — the opposite direction from #653, which needs to look at a component the app *itself* declared and never mentions a `Pk*` name at all.

Conclusion: #653 is not a new tool. It is **one more rule in family B** (call it B7), reusing the same engine, the same generated-data pattern, the same CLI, the same text/JSON output, the same severity model (family B rules that are heuristic stay warnings — see #629 design section 6: "a rule stays a warning when a reliable fix cannot be produced from data or the detector infers intent").

### 1.2 `api-surface.mjs` / `api.baseline.json` — covers the wrong layer

`core/tools/api-surface.mjs` extracts classes, tokens, JS exports and **the vanilla element API** (`elementSurface()`, from `core/elements/*/*.meta.json`: tag, props with type/default/enum, slots, events, parts, CSS properties, methods) into `core/site/scorecard/api.baseline.json`, used by the release process (`versioning.mjs`) to compute the version bump a change needs.

It does **not** read `blazor/mappings/*.json` and has no notion of a C# `[Parameter]` or a Razor component name. It answers "what changed in the vanilla element API since the last release," not "what does `PkFieldListRow` look like in C#." So it cannot be reused directly as the comparison target for #653; the data #653 needs already exists, but in a different file (`blazor/mappings/*.json`, one file per component: `{ component, params: [{ name, prop|event|slot, type }] }` — already exactly `component name → parameter list with types`).

### 1.3 `blazor/mappings/*.json` — has the right shape, wrong distribution

119 files, one per `Pk*` component, each `{ component: "PkAccordionItem", params: [{ name: "Heading", prop: "heading", type: "string" }, ...] }`. This is already the source of truth for `scripts/generate-blazor.mjs` (generates the `.razor` wrapper source) and `scripts/build-skills.mjs` (generates the `plainkit-blazor` skill docs). It is exactly the per-component `name → params[].{name,type}` table #653 needs as the comparison target.

But it is a **repository-only, build-time source**. Checked directly: `scripts/check-package.mjs`'s `REQUIRED`/`FORBIDDEN` lists for the `PlainKit.Blazor` NuGet package include the DLL, XML docs, README, `staticwebassets/plainkit/` (CSS, the modules unit, the two skills) — nothing under `blazor/mappings/`. It is not embedded as a resource, not in `content/`, not in `staticwebassets/`. **A consuming app that has only `dotnet add package PlainKit.Blazor` has no access to this file today.** This is the concrete design gap the issue's "installed `PlainKit.Blazor` package's public component list" phrase glosses over, and section 3 below resolves it.

### 1.4 `PkScorecard`

The devtools scorecard (`core/site/scorecard/`, `scripts/scorecard-sweep.mjs`) scores *rendered pages* against layout/spacing/contrast/tap-target/CSS-budget rules — a runtime, visual audit, not a source-level one. It has no parameter-list or component-catalogue notion at all and is the wrong shape for "compare a `.razor` file's declared parameters against a catalogue" (that is a static-source question, answered before the page ever renders). It is useful precedent only for "PlainKit tooling can ship developer-facing checks," which the audit CLI already is.

### 1.5 Roslyn — not adopted elsewhere in this repository

Nothing under `core/tools/` or `blazor/` uses Roslyn or `dotnet` at analysis time; the .NET side is exclusively `dotnet build`/`dotnet test` on `PlainKit.slnx`. The audit CLI is explicitly designed dependency-free (`core/package.json` has no dependencies, and the #629 design's Q6 already recommends *against* even a JS parser dependency like `acorn` for the audit, let alone a cross-language one). The stated repo philosophy (confirmed earlier this session): minimal dependencies that serve speed/reliability/security/accessibility/scalability — a Roslyn dependency should clear that bar, not be assumed.

Family B already commits to *not* parsing C# semantically for the existing B rules ("In `@code` blocks C# is not parsed; B rules do not run on C#", #629 design section 7) and instead uses narrow regexes (`OpenElement\(\s*\d+\s*,\s*"(div|span|...)"`) for the one C#-emitted-markup case it needs (B1's `RenderTreeBuilder` variant). Extracting `[Parameter]` declarations is the same kind of narrow, well-known-shape problem (see section 2.2) — a text scan is consistent with everything else in this family, not a departure from it.

## 2. Three approaches considered

### Approach 1 — New rule (B7) inside `plainkit audit`, heuristic text scan (recommended)

Add one rule to family B: extract the consumer's own component's declared parameters (regex over `[Parameter]`/`[CascadingParameter]` property declarations, in `@code` blocks and in `.razor.cs`/partial-class files), and score them against every entry of a shipped `Pk*` component manifest (section 3). A match above threshold is a warning, always, in both modes (never promoted to error — it is exactly the kind of "detector infers intent" case section 6 of the #629 design already carves out for D7/B5).

**Pros:** reuses the whole engine, CLI, config, allow-list/ratchet, text/JSON output, `--explain`, the skills-generation pipeline (section 8 of the #629 design already wires "rule table → skill docs"), and the severity model, for near-zero new surface. One new rule id, one new data file, one new scanner function. Ships as part of the same `npx plainkit audit` a Blazor app is already expected to run per the #629 design (section 7: "a .NET consumer runs it with `npx plainkit audit`"). No new dependency, no new binary, no new install step.

**Cons:** heuristic, not exact — see section 4 for the false-positive mitigation. Confined to what a regex can reliably find (a `[Parameter]` on a normal auto-property); an unusual declaration shape (a parameter defined via a source generator, or backed by a field instead of an auto-property) is missed, same honest-limits tradeoff the #629 design already accepts for the rest of family B and for T1–T3's literal-value scanners.

### Approach 2 — Separate tool: a Roslyn analyzer or `dotnet` CLI

A genuine C# analyzer (`Microsoft.CodeAnalysis.CSharp`) parses `.razor`/`.cs` semantically: no regex edge cases, correct handling of partial classes, base-class parameters, generic components, `[Parameter]` inherited through a Razor `@inherits`, attributes on non-property members, etc.

**Pros:** more accurate; a Roslyn analyzer can also run *inside the IDE* as a live diagnostic (squiggly underline), not just at CLI time, which is a real capability the text-scan approach cannot match.

**Cons:** introduces a second toolchain into a project whose SDK build is Node-first — a `dotnet`-only analyzer cannot run in the `npx plainkit audit` a non-.NET part of a mixed team already uses for JS files, forks the "one engine" property section 1 of the #629 design is built around, needs its own packaging/versioning/release path (a Roslyn analyzer ships as a NuGet package with `analyzer` assets, entirely separate from `staticwebassets`), and is disproportionate to the problem: #653's own worked example (`AppField` vs `PkFieldListRow`) is a handful of simple auto-properties, exactly what a regex finds reliably. Given the repo's stated minimal-dependency bar and that nothing else here uses Roslyn, this is not proportionate for v1.

### Approach 3 — Devtools tab (`PkScorecard`-style, runtime)

A dev-tools panel that, at runtime, inspects the rendered component tree (or a build-time manifest fed to it) and flags likely duplicates in the browser, alongside the existing scorecard checks.

**Cons:** the information needed (declared `[Parameter]` names/types) does not exist at runtime in a form worth extracting — Blazor does not reflect parameter *source* shape usefully post-compile without extra codegen, and the problem is fundamentally a source-level, pre-render question ("should this file exist at all"), the same reason PkScorecard's own checks are all rendered-DOM concerns (layout, contrast) rather than source concerns. Doing this at CLI/source time (approach 1) also means it runs in CI, which a devtools tab cannot.

### Recommendation

**Approach 1.** It is proportionate to the problem, fits the architecture already designed and mostly built for #629, needs no new dependency or toolchain, and ships as one more line in the rule table a Blazor consumer already runs. Roslyn (approach 2) is not recommended: this repository has no Roslyn dependency today, the accuracy gain is real but not required to catch #653's own worked example, and it would fork the CLI into two toolchains for one rule family. If IDE-time live diagnostics become a stated goal later (not asked for in #653), that is a separate, larger design question — not a reason to block a CLI rule now.

## 3. Where the comparison data comes from at audit time

This is the concrete gap identified in section 1.3: `blazor/mappings/*.json` is real and correctly shaped, but is not part of the published `PlainKit.Blazor` package today. Two things must happen:

1. **Ship a generated manifest with the package.** Add a small script (or extend `data.mjs`'s pattern with a Blazor-specific `blazor/tools/build-component-manifest.mjs`, run by `scripts/bootstrap.mjs` alongside the existing Blazor generation step) that reads every `blazor/mappings/*.json` and writes one file: `blazor/src/PlainKit.Blazor/wwwroot/plainkit/blazor/components.json` — already the generated `wwwroot/plainkit/` tree that `scripts/bootstrap.mjs` produces and `check-package.mjs` already asserts is present as `staticwebassets/plainkit/...` in the packed `.nupkg`. Shape: `{ [component: string]: { params: [{ name, type, kind: "prop"|"event"|"slot" }] } }` — the same fields `blazor/mappings/*.json` already has, flattened into one file so the CLI does not need to enumerate 119 files. Add one line to `check-package.mjs`'s `REQUIRED` list: `staticwebassets/plainkit/blazor/components.json`.
2. **Locate it at audit time from the consumer's own build output**, not from `node_modules` (the CLI is Node, but the data lives in a NuGet package). Static web assets from a referenced Razor Class Library are copied by the .NET build into the consuming app's own output as `wwwroot/_content/PlainKit.Blazor/plainkit/blazor/components.json` (the standard RCL static-asset convention — this already happens today for `plainkit.css` and the dev-tools modules, which consumer apps already reference via `_content/PlainKit.Blazor/...` paths per the existing Blazor skill). The audit CLI, when scanning a project with `.razor` files, looks for that path relative to each `--paths` root (and any `wwwroot/_content/PlainKit.Blazor/` it finds under the config's `dir`), falling back to an explicit `"blazorComponentManifest": "path/to/components.json"` key in `plainkit.audit.json` (following the same explicit-override pattern `config.mjs` already uses for `include`/`ignore`) when the app's build output lives somewhere nonstandard (a custom `StaticWebAssetBasePath`, a pre-`dotnet build` CI run). If neither is found, B7 reports zero findings and a `skipped` note in the JSON summary (`skippedRules`-style), the same "no silent failure, but also no crash on missing data" behavior `S6` already has when it can't see a consumer's own import config.

This keeps the "pure, no repository paths" property intact: the CLI never reads `blazor/mappings/*.json` directly (that stays a build-time-only source, same restriction `hints.mjs` already enforces for the vanilla side) — it reads a shipped, versioned JSON file that happens to have been generated from that source at package-build time, exactly the same relationship `generated.data.mjs` has to `core/elements/*/*.meta.json` today.

## 4. The comparison algorithm

**Inputs, per candidate:**
- The app's own component: extracted `{ name: <declared file's component name>, params: [{ name, type }] }` from `[Parameter]`/`[CascadingParameter]` auto-properties (regex: `\[Parameter(?:\s*\([^)]*\))?\]\s*(?:\[[^\]]+\]\s*)*public\s+([\w<>,?\[\]\s]+?)\s+(\w+)\s*\{\s*get;\s*(?:init|set);\s*\}`, applied to `@code { ... }` blocks in `.razor` and to top-level class bodies in `.razor.cs`/partial `.cs` files matching the component's own file-name stem — the same "narrow, well-known-shape" scope B1's `RenderTreeBuilder` regex already uses). `EventCallback<T>`-typed parameters and `RenderFragment`/`RenderFragment<T>` (slot-equivalent) parameters are included with a `kind` the same way `blazor/mappings` already tags them (`prop`/`event`/`slot`), so a match can weight a slot-for-slot pair the same as the mapping data does.
- Each catalogue component from `components.json` (section 3): `{ name, params: [{ name, type, kind }] }`.

**Scoring, per (app component, catalogue component) pair:**
1. **Name similarity per parameter pair:** exact case-insensitive match, or Levenshtein distance ≤ 2 on names ≥ 4 characters (catches `Label`↔`Heading`... no — catches `Value`↔`Values`, `When`↔`Show`, not semantic synonyms; semantic renames like `Label`↔`Heading` are *not* caught by edit distance and are an accepted honest limit, called out explicitly rather than pretending fuzzy-name matching solves them).
2. **Type compatibility:** the two params' types must be "compatible" — identical after stripping nullability (`string` ~ `string?`), or both `EventCallback<...>`/both `RenderFragment...`/both a known primitive-equivalent pair (`bool`~`bool?`). A `string` parameter never matches an `int` parameter regardless of name.
3. Each app parameter contributes at most one match (bipartite, greedy by best name-distance) to avoid inflating the score by matching one catalogue parameter twice.
4. **Overlap score** = (matched pairs) / (max(app param count, catalogue param count)) — a symmetric coverage measure so a 3-parameter app component isn't unfairly rewarded for "matching" 3 of a 12-parameter catalogue component's params (Jaccard-style, not "how many of *my* params matched").

**Firing threshold (the false-positive guard the issue itself worries about — "two unrelated components that happen to both have a `Label` and `Value`"):**
- Overlap score ≥ 0.6, **and**
- at least 3 matched parameter pairs, **or** (matched pairs == app's total param count **and** app's total param count ≥ 2 **and** the catalogue component has ≤ 3 params total — i.e. a small app component is only flagged against an equally small catalogue component when it matches *completely*, not partially).
- This directly defeats the issue's own worry: a coincidental `Label`+`Value` pair (2 matches) against a 12-parameter catalogue component scores 2/12 ≈ 0.17, far under threshold; against a 2-parameter catalogue component it is a full match (both conditions above satisfied) and correctly fires, because a 2-for-2 exact shape match on a small component genuinely is the `AppField`/`PkFieldListRow` case (`Label`, `Value`, `ChildContent`, `When`, `SkipEmpty` — 5 of 5 matched, well over threshold).
- The best-scoring catalogue component per app component is reported; ties are reported as multiple suggestions (rare, and informative rather than wrong).

**Severity:** always `warn`, in both normal and strict mode — same treatment as D7/B5 ("the detector infers intent"). It never becomes an error: a false positive that blocked CI would be worse than a missed duplicate, and #653 describes a periodic manual audit, not a merge gate.

## 5. CLI and output shape

Fits directly into the existing `plainkit audit` output (`format.mjs`'s text and JSON writers), no new flags needed for the common case:

**Text** (same `FIX:` convention as every other rule):
```
FIX: Components/AppField.razor:1 declares Label, Value, ChildContent, When, SkipEmpty - a 100% match for PkFieldListRow's params (Label, Value, ChildContent, When, SkipEmpty). Consider using <PkFieldListRow> instead of this app component. https://plainkit.dev/gallery/field-list-row [B7]
```

**JSON** (one more finding in the existing `findings[]` array, `rule: "B7"`, plus the two extra fields this rule alone carries):
```json
{
  "rule": "B7",
  "file": "Components/AppField.razor",
  "line": 1,
  "severity": "warn",
  "message": "AppField's public API matches PkFieldListRow (5/5 parameters, 100%)",
  "match": { "component": "PkFieldListRow", "score": 1.0, "matchedParams": 5, "totalParams": 5 },
  "fix": "FIX: ... [B7]"
}
```

New CLI surface: none required for v1 beyond the manifest-location config key (`blazorComponentManifest`, section 3) — `--rule B7` / `--skip B7` already work today (`selectRules` matches by id prefix). `--list-rules` and `--explain B7` pick it up automatically once it's in `RULES`.

## 6. Also in scope: the SDK's own source (`core/`), not just consuming apps

Added after this document's first draft, at the owner's direction: this tooling must also be runnable **against `core/` itself**, to catch two elements or modules independently reinventing the same small utility inside the SDK — not only a consuming app duplicating a `Pk*` component. This is a real, distinct case from B7 and needs its own placement, not a stretch of family B.

**Why it isn't family B.** Family B is explicitly "Blazor and Razor only" (#629 design section 2.6) — its rules exist *because* the Blazor surface differs from the vanilla one (`Pk*` component names, `[Parameter]`, `blazor/mappings`). A same-repo, vanilla-JS duplication check has no Razor in it at all: it compares one `core/elements/*/*.js` (or `core/js/**`) file's shape against another's, both in the language the rest of the audit already scans without any Blazor-specific machinery.

**Why it isn't a stretch of the existing D family either, unchanged.** Family D ("duplicating an element or its interaction logic", section 2.1 of #629) already exists, but every D rule today compares **a consumer app's usage** against **the element catalogue** (a raw `<table>` where `pk-table` exists, hand-rolled pointer-drag where `pk-splitter` exists). It has no notion of comparing two catalogue entries, or two `core/js` modules, against *each other*. That said, D is still the right family conceptually — "duplicating logic" is exactly the problem — so this is **D10** (next free id after D1–D9), not a new letter, with a different `applies`/target than D1–D9: where D1–D9 run against a consumer's source tree, D10 is designed to run with the audit **pointed at `core/` itself** (`plainkit audit core/elements core/js`, or the internal equivalent — see below), comparing entries within the target tree pairwise instead of against a fixed external catalogue.

**How it's actually different from B7, mechanically.** B7 compares one thing (an app's custom component) against a fixed, known catalogue (`Pk*` components) — one-directional, catalogue-vs-candidate. D10 as scoped here is narrower than a full pairwise-everything scan would suggest: v1 targets **element-level API shape** the same way B7 does, just symmetrically and vanilla — reuse the *same* scoring function from section 4 (name/type overlap, coverage threshold), but run it element-meta-vs-element-meta across `core/elements/*/*.meta.json` (already the data `data.mjs` already parses for the consumer-facing hints) instead of app-component-vs-catalogue. That catches "two elements grew a near-identical prop set" — a real, boundable instance of the problem — without needing general code-clone detection (see section 7) for v1.

**Is this "internal" or does it run through the same CLI as a consumer?** The same `plainkit audit` CLI and engine, pointed at a different directory — no architectural split needed. The "pure, no repository paths" constraint (#629 design section 1, section 11 here) is about the *engine's source code* never importing `core/js`/`core/elements`/`core/site` at runtime; it says nothing about what directory a user *points the CLI at*. Running `node core/tools/audit/cli.mjs core/elements` from within this repository's own `scripts/verify.mjs` (a new, non-blocking `CHECKS` entry, same pattern as the `browser` and `scorecard` local-only checks) is exactly as legitimate as running it against any other source tree — the CLI has no idea it's scanning its own maker's code. Severity stays `warn` for D10 as for B7, for the same "detector infers intent" reason (section 6 of the #629 design), and it is **not** part of `core/samples/app`'s zero-findings strict gate (section 9 of the #629 design) — it's a periodic, human-reviewed signal against `core/elements`/`core/js` itself, not a per-PR gate (two elements sharing a small prop set is common and often fine; a human decides whether it's the `AppField` case).

**Rule id and placement, stated plainly:** `D10`, in `core/tools/audit/families/d-rules.mjs`, alongside D1–D9, reusing the section-4 scoring function as a shared module (not duplicated between B7 and D10 — see PR C-6 below) rather than reimplemented per family.

## 7. The broader pattern: a "rule of three," and what's realistically v1

The owner's fuller framing, also added after the first draft: this is really about a maturity ladder for *any* repeated pattern, not just full components —

1. **1st occurrence:** local/custom code is fine, no smell.
2. **2nd occurrence of the same pattern:** should be centralized into a shared utility/helper (not yet its own module/component).
3. **3rd occurrence:** should be modularized — extracted into its own reusable module/component.

**This is explicitly a bigger problem than B7/D10 as designed above, and this document does not try to force it into the same mechanism.** B7 and D10 answer one narrow, tractable question: "does this component's *public parameter list* fully match an existing component's?" — a structural comparison over a small, well-defined shape (`{name, type}` pairs), with a known-size catalogue on one side. The rule-of-three principle is a **general clone/duplication-detection problem**: it has to recognize a repeated *pattern* at all (a helper function, a CSS shape, a markup fragment, a state-machine snippet) wherever it appears, in either stack, count its occurrences across the whole tree, and give an escalating recommendation by count — closer to what tools like `jscpd`/PMD CPD do (token-sequence or AST-fragment hashing with a similarity threshold) than to anything `core/tools/audit` does today. None of the existing scanners (tag tokenizer, JS/CSS tokenizers, the section-4 name/type scorer) do arbitrary-pattern clone detection, and building one is a materially larger project: it needs a normalized-token representation per language, a similarity/hash index across the whole scanned tree (not per-file), and a materially different rule shape than the engine's current one-file-in/hits-out model, since "this is occurrence #2 of pattern X" requires cross-file state the engine doesn't carry today.

**Explicit relationship and scope call:** B7 (and D10, its `core/`-facing sibling) is **one specific, tractable instance of the general rule-of-three principle** — it detects occurrence-vs-catalogue for the one pattern shape (a full component's public API) that's cheap to compare and already has a natural "canonical form" to converge on (the `Pk*` component itself, or an existing `core/elements` entry). **The general form — arbitrary repeated code patterns, counted across occurrences, with an escalating centralize-then-modularize recommendation — is out of scope for this spec and is a follow-up direction**, tracked separately (the owner should open a new issue referencing #653 and this document if it's wanted; this document does not propose one on its own, per the task's own scope: design only). A sketch of what that follow-up would need to answer, for whoever picks it up: what counts as "the same pattern" (exact token match vs. fuzzy/AST similarity, and at what threshold), what granularity triggers it (a whole function? a sequence of N statements? a CSS rule block?), how the "1st/2nd/3rd occurrence" count survives incremental scans (a ratchet-like state file, similar to the existing allow-list's `count`, or a fresh full-tree scan every run), and whether it can stay dependency-free the way this document's B7/D10 recommendation does, or whether true clone detection is the one place in this toolchain where a small, audited dependency (a `jscpd`-style algorithm, MIT-licensed, no runtime footprint since it's dev-tooling only) is actually justified — a question this document raises but does not answer.

## 8. PR-split proposal

Family B (B1–B6) is itself unimplemented (section 1.1); this design assumes B7 lands *after* B1–B6 exist (A-9 in the #629 breakdown), since it reuses the same Razor-scanner and `blazor/mappings`-sourced hint plumbing those rules already need. If the owner wants #653 sooner than the full family, B7 can be pulled forward as its own slice because it does not depend on B1–B6's *rules* (only on the Razor `@code`-block extraction machinery A-9 also needs) — call this out as an explicit option below.

| PR | scope | depends on | est. lines |
|---|---|---|---:|
| C-1 | shipped component manifest: `blazor/tools/build-component-manifest.mjs` (flattens `blazor/mappings/*.json` into `wwwroot/plainkit/blazor/components.json`), wired into `scripts/bootstrap.mjs`, `check-package.mjs` REQUIRED entry, a packaging test | none (parallel with A-1..A-8) | ~150 |
| C-2 | `[Parameter]`/`[CascadingParameter]` extraction: the regex scanner over `@code` blocks and `.razor.cs`/partial-class files, with its own unit tests (including the "not a Parameter" and "field-backed, not caught" honest-limit cases) | A-9's Razor scanner (or a minimal standalone extraction if B7 is pulled forward) | ~200 |
| C-3 | the scoring algorithm (section 4) as a pure, shared function (`core/tools/audit/scanners/api-similarity.mjs`, used by both B7 and D10 — section 6), with a table-driven test suite proving the threshold math on the `AppField`/`PkFieldListRow` case and the "coincidental 2-param overlap against a large component" negative case | C-2 | ~170 |
| C-4 | rule B7 itself: wiring into `families/b-rules.mjs`, the manifest-discovery logic (section 3, including the `blazorComponentManifest` config key and the "not found" skip path), fix template, `--explain` text | C-1, C-3 | ~150 |
| C-5 | docs and dogfood for B7: `plainkit-blazor` skill's "Check your work" step gains "and B7 for components you wrote yourself", one fixture app under `core/tests/audit-fixtures/blazor-duplicate/` with an `AppField`-shaped component expecting B7, a negative fixture with an unrelated 2-param component expecting nothing, changelog fragment | C-4 | ~120 |
| C-6 | rule D10: wiring into `families/d-rules.mjs` reusing C-3's scorer against `core/elements/*/*.meta.json` pairs, a `verify.mjs` local-only `CHECKS` entry (non-blocking, same pattern as `browser`/`scorecard`) that runs it over `core/elements` and `core/js` and prints findings for a human to review, its own tests (including a same-repo negative case: two elements that legitimately share a couple of props, e.g. `label`, and must not fire) | C-3 | ~180 |

Total ≈ 970 hand-written lines across 6 PRs, each under the ~400-line guidance in `AGENTS.md`. C-1 can start immediately and in parallel with the rest of the #629 breakdown; C-2 through C-6 are otherwise sequential except C-6, which only needs C-3 and can run in parallel with C-4/C-5.

## 9. Open questions for the owner

- **Q1.** Pull B7 forward ahead of B1–B6 (a standalone Razor `@code`-extraction slice just for this rule), or land it after family B as designed in the #629 breakdown (A-9)? This document assumes "after," matching #629's stated order, but #653 stands alone if the owner wants it sooner.
- **Q2.** Is a Levenshtein-2 name-fuzz plus exact-type-family match the right bar, or should v1 ship name-exact-only (simpler, fewer surprising near-misses) and add fuzzing later once real false-positive data exists from Backend.Web? The scoring in section 4 is the more permissive of the two; exact-only is a smaller first PR.
- **Q3.** Should B7 also compare against the app's *own* `Components/` tree pairwise (two hand-rolled app components that duplicate *each other*), not just against the shipped catalogue? Out of scope here — #653 is specifically about missing a native equivalent, not general in-app duplication — but the same scoring function would work for it later.
- **Q4.** `components.json`'s distribution (section 3) relies on the standard RCL static-web-asset copy-to-`wwwroot/_content` behavior. Should the CLI also accept pointing directly at an extracted or unzipped `.nupkg` path for a CI environment that hasn't run a full `dotnet build` yet? Proposed: yes, via the same `blazorComponentManifest` config key, no separate flag needed.
- **Q5.** Confirm severity stays `warn` forever (never promotable in strict mode), per section 4 — this document treats it the same as D7/B5 and does not propose a path to `error`.
- **Q6.** D10 (section 6) is proposed as a local-only, non-blocking `verify.mjs` check (like `browser`/`scorecard`), reviewed periodically by a human, not gating CI. Confirm that's the right posture for "the SDK duplicating itself" — or should a clean `core/elements`/`core/js` baseline (zero D10 findings today) be captured and ratcheted, the same way the strict-mode allow-list ratchets a consumer app, so a *new* internal duplicate is caught in CI going forward even though today's baseline isn't audited yet?
- **Q7.** Should D10 also compare `core/js` module-level exports (not just `core/elements/*/*.meta.json` shapes) — e.g. two elements' internal helper functions converging on the same behavior, which the meta files don't capture at all? Section 6 scopes D10 v1 to element *API* shape only (metadata-driven, cheap); catching duplicated *internal logic* (not just public API) needs something closer to the general clone detection of section 7, not the section-4 scorer.
- **Q8.** Section 7 flags the general "rule of three" (arbitrary-pattern clone detection with an escalating centralize-then-modularize recommendation) as out of scope for this document. Confirm that's acceptable, and if wanted, should a follow-up issue be opened now referencing #653, or held until B7/D10 ship and their false-positive/negative rate is known (which would inform whether a heavier clone-detection investment is worth it)?

## 10. Verification of this document

- Read in the repository: `core/tools/audit/{cli,rules,config,data,hints,format,util,glob}.mjs`, `core/tools/audit/families/{s,d,t,a}-rules.mjs` in full, `core/tools/api-surface.mjs` in full, `scripts/check-package.mjs` (REQUIRED/FORBIDDEN lists), `blazor/mappings/accordion-item.json` (and confirmed the directory holds 119 such files, one per component, same shape throughout by spot-check), `docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md` in full (sections 1, 2.6, 3, 6, 7, 8, 11–14 read closely; family B's design already exists and is unimplemented), `gh issue view 653`.
- Not measured: false-positive/false-negative rate of the section 4 threshold against real consuming-app code (only checked by hand against the issue's own `AppField`/`PkFieldListRow` example and one hypothetical negative case); actual line counts for the PR-split are estimates; D10 (section 6) and the rule-of-three follow-up (section 7) are design-level proposals, not validated against real `core/elements`/`core/js` duplication (a real pass over `core/elements` to see what D10 would actually flag today was not run — that's C-6's own dogfood step).
- Nothing was implemented or run; no result in this document comes from executing a scanner or CLI.
