# Real JS/CSS minification via esbuild

## Problem

`core/tools/build.mjs` generates `dist/elements/<name>.js` (119 element modules), `dist/js/*.js` (shared runtime modules), `dist/plainkit.js` (the entry point) and `dist/modules/<tool>/**` (dev-tool modules) with comments stripped but **no minification**: every local variable and `$`-prefixed field keeps its full source name. CSS gets a hand-rolled regex minifier (`minify()` in `build.mjs`, comment/whitespace stripping only — not real minification).

This wastes gzip budget on identifier names for no benefit, since none of it is meant to be human-read in `dist/`. It surfaced concretely in issue #600: folding pk-dock's consolidated feature set into one release pushed `dist/elements/dock.js` 40 bytes over its 4.5 KB gzip budget (`core/tests/budgets.test.mjs`), requiring manual identifier-shortening in source (`targetTitle` → `tt`, etc.) purely to claw back bytes — a purely mechanical, build-tooling-shaped problem being solved by hand, and a tax every future PR pushing an element close to budget will repeat.

It also means the *measured* budgets in `core/site/scorecard/scoring.data.js` don't reflect real achievable transfer size — they're stricter than intended in some places (headroom a minifier would already buy back) and the one-off `elementGzKbOverrides['dock.js']` hard cap (added in #634, tracked for removal in #639) exists only because minification doesn't.

## Goals

- Close #600: real minification (identifier shortening, dead-code elimination, constant-folding) as a build step before gzip measurement.
- Ratchet `elementGzKb.limit` down to reflect real minified sizes once measured, and delete `elementGzKbOverrides['dock.js']` (closes #639) if it now fits under the new limit.
- Retire the hand-rolled CSS `minify()` regex function in favor of the same tool, for one code path instead of two.
- Apply uniformly to every generated JS output (elements, shared `js/`, `plainkit.js`, dev-tool `modules/`) — no double standard between "SDK" and "devtools" code. This is a project-wide value (minimal footprint, feature-rich), not a budget-gated corner case.
- Do this without weakening `core/package.json`'s "no runtime dependencies" claim to actual SDK consumers.

## Non-goals

- Bundling/tree-shaking across module boundaries beyond what a single-file `transformSync` call does per generated file. Each `dist/elements/<name>.js` stays its own ES module, loaded the way `js/loader.js` already loads it — this changes *what's inside* each generated file, not the module graph.
- Changing anything in `blazor/src/PlainKit.Blazor/**` beyond what `scripts/publish-dist.mjs`'s existing byte-for-byte copy already does automatically.
- Investigating or fixing issue #640 (the `/_plainkit` `querySelector` crash) — confirmed unrelated root cause, tracked and being fixed separately. That fix ships first as `0.8.0-alpha.2` (a hotfix release); this work lands afterward, independently.

## Design

### Dependency placement

A new **root-level `package.json`** (`"private": true`, never published), holding `esbuild` as the sole `devDependency`, pinned to an exact version (no `^`/`~` range — this build must stay deterministic across installs), with a committed `package-lock.json`. `core/package.json` — the actual published npm package manifest, whose description advertises "no runtime dependencies" — is untouched: still zero dependencies, still what ships to consumers. `node_modules/` is already gitignored (`.gitignore:13`).

### Build integration

`core/tools/build.mjs` imports `esbuild` and calls **`transformSync`** (esbuild's synchronous Node API entry point, built for exactly this build-tool use case) at each of the current generation points:

- JS: `elementModule()` (used for every `dist/elements/<name>.js`), the shared `dist/js/*.js` emitters, `dist/plainkit.js`, and `dist/modules/**` (via `modules-dist.mjs`) all pipe their generated source through `esbuild.transformSync(code, { loader: 'js', minify: true })` (`minify: true` is `minifyWhitespace + minifyIdentifiers + minifySyntax`, which includes dead-code elimination and constant-folding) before being written.
- CSS: the same call with `loader: 'css'` replaces the hand-rolled `minify()` function (`build.mjs:102`) at its one call site (`dist/plainkit.min.css`, `build.mjs:175`) and the `minifyCss` path in `elementModule()` (`build.mjs:97`, used for element `<style>` blocks). The regex `minify()` function is deleted.
- `build.mjs` stays **fully synchronous** end-to-end — no `async`/`await` refactor needed anywhere in the bootstrap pipeline, since `transformSync` returns directly.

**Identifier-mangling safety** (checked, not just assumed): esbuild's default `minifyIdentifiers` only renames local variables and function-scope bindings — it never renames object or class property names unless `mangleProps` is explicitly set (which this design does **not** enable). A grep across `core/elements` and `core/js` for bracket-notation property access (`obj['$foo']`) and `toString()`/reflection-on-source patterns found none that depend on property names surviving verbatim in generated output beyond ordinary `.property` access, which is untouched by default minification. `$`-prefixed convention-private fields (real object properties, not `#private` class fields) are therefore safe as-is — no extra esbuild config required to protect them.

### CI/workflow changes

None of `ci.yml`, `release.yml`, or `pages.yml` currently run `npm install` anywhere — every job invokes `node scripts/...` directly, since there has never been a `node_modules` to install. Each workflow gets one new step, `npm ci` (root `package-lock.json`), inserted before the first `node scripts/bootstrap.mjs` (or `verify.mjs`) call in every job that runs the build.

### Budget re-baselining

After the minification pipeline is wired up and produces correct output (verified per Testing below), re-run the full build and measure every element's real gzip size (`node scripts/verify.mjs --only node` will surface `budgets.test.mjs`'s current numbers; a one-off script or manual pass reads real sizes). Ratchet `elementGzKb.limit` in `core/site/scorecard/scoring.data.js` down to a new ceiling that reflects real minified sizes with reasonable headroom — not the single tightest element's exact size, since that would recreate the same one-PR-over-budget problem the day after landing.

Delete `elementGzKbOverrides['dock.js']` (and its explanatory comment) if dock.js now fits under the new blanket limit — this closes #639. If it still doesn't fit even post-minification, leave the override in place and update its note to say why (minification alone wasn't enough), rather than silently deleting a still-needed exception.

Check whether `appEntryGzKb`'s existing hard-cap-vs-ratchet exception (#514) is affected by the same minification pass — `core/site/**`'s entry bundle goes through the same JS minification path — and re-measure it too, though its resolution (raise vs. hold) is a separate decision from dock.js's.

### Testing

- `core/tests/budgets.test.mjs` already does gzip measurement against `BUDGETS` — it needs the new, ratcheted numbers, not new logic.
- New test: a smoke test that imports one minified element module (e.g. via the same mechanism `js/loader.js` uses) and asserts it still defines its custom element and renders correctly — this exercises genuinely new build behavior (minified output actually executing correctly) that nothing currently covers.
- Full `node scripts/verify.mjs --pack` before considering this done — `blazor/src/PlainKit.Blazor/wwwroot/plainkit` (via `publish-dist.mjs`) and the NuGet package both depend on `core/dist` being correct post-minification, and `pack`'s `check-package.mjs` is the check that would catch a broken copy.
- Manual spot-check: open a few gallery pages (including at least one interactive element like `pk-dock` or `pk-table`) in the browser preview against the minified build, confirm no runtime errors, before calling this done — minified-but-broken is worse than unminified.

## Risks / open questions for the plan to resolve concretely

- **Actual bootstrap time impact** is asserted here as "should stay well within ~14s" based on esbuild's known per-file speed, but needs real measurement once wired up, not just assumption.
- **`appEntryGzKb`'s fate** (hold, ratchet, or something else) is explicitly deferred to when the real post-minification number is known, not decided here.
