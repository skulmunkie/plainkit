# Hand-off: shipping the SDK's tools as modules (T-138)

> **Migration status (2026-09-20):** this folder was moved here from a private project as the first commit of the Plainkit repository. Done: renamed to Plainkit (`sdk-` to `pk-`, `--sdk-*` to `--pk-*`, `data-sdk-*` to `data-pk-*`, `dist/plainkit*.css|js`), MIT licence, privacy scrub of demo content and generic chip tones. Still to do: move the Blazor port (`blazor/`, Plainkit.Blazor) here once it is cleaned of app-specific content, and add its CI job and the NuGet step to `release.yml`. Paths below that say `sdk/` mean this `core/` folder.

For a fresh agent picking this up cold, most likely in the SDK's own repository (the SDK is being renamed Plainkit, element prefix `sdk-` becoming `pk-`, licence MIT). Read `README.md` and `Standards/Plainkit.md` ("Embedding the gallery" and "Tool modules") first; this file is the state of the work and what is left.

## The rule that settles every decision

The deliverable for each capability is a **JavaScript module** with a small API, `mountX(container, options)`, that a developer calls from their own project, self-contained in `dist/<name>/`. A tag (`<pk-x>` / `<pk-x>`) is optional sugar: add one only when it is a thin layer over the module (about a dozen lines of logic, like `<pk-gallery>`); otherwise skip it and say why. Keep it clean and simple. It is not a Vue or Bootstrap replacement. No new dependencies. Wrap or reuse what exists; do not rebuild.

## What is built (all committed, nothing pushed)

| Capability | Module | Element | Status |
|---|---|---|---|
| Gallery | `mountGallery(container, options)` in `site/gallery/gallery.js`, shipped as `dist/gallery/` | `<pk-gallery>` (`elements/gallery/`), a lazy frame over `dist/gallery/embed.html` | done |
| Code explorer | `mountCodeExplorer(container, options)` in `modules/code-explorer/code-explorer.js`, shipped as `dist/code-explorer/` | none: `<code-explorer>` already is the element form | done |
| Scorecard | `mountScorecard(container, options)` in `modules/scorecard/scorecard.js` (+ `scorecard.css`), shipped as `dist/scorecard/` | none: a run is an action, not markup | done |
| Theme editor | not started | decide when built | left |

### Gallery

Options: `kind` (foundations, controls, elements, layouts, templates), `group`, `control` (id or list; elements by tag), `theme`, `width` (desktop, phone), `filter`, `chrome` (`none` default, `full`), `height`; `src` on the element only. Pure option parsing and tree cutting live in `js/gallery-options.js` (node tests). `<pk-gallery>` frames `dist/gallery/embed.html?...` and follows the content height by `postMessage` (source window and origin checked). `dist/gallery/` is about 742 KB raw, 138 KB gzipped, fetched only when used.

### The dist pattern (`tools/gallery-dist.mjs`, `tools/modules-dist.mjs`)

The build writes each tool's source with its paths resolved for the dist layout: `relocate()` drops one `../` from an import that leaves the folder, a generated `paths.js` (gallery) or a swapped `STYLES` line (modules) points at `plainkit.css` plus `plainkit-compat.css`, and every runtime URL is built from `import.meta.url`, so `dist/` works when copied anywhere or served from a CDN prefix. Module sources sit in `modules/<name>/`; the SDK site's own page is a thin host on the same module. To add a tool: create `modules/<name>/<name>.js` (`const STYLES = ['../../plainkit.css'];` plus optional `OWN_STYLES` for its own css), add it to `MODULES` in `tools/modules-dist.mjs`, build. `tests/modules-dist.test.mjs` then checks its dist folder automatically (imports resolve, no source paths, both stylesheets requested). `js/mount-support.js` holds `ensureStyles` (adds `plainkit.css` and `plainkit-compat.css` to the document if missing; the tools are page-level so they bring the SDK base styles), `styleUrls`, and `loadJson` (a URL or a ready object).

### Code explorer

`mountCodeExplorer(container, { snapshot, provider, file, line, search, theme, height })` returns `{ element, openFile(path, { line }), search(query), destroy() }`. `snapshot` is a URL or the parsed object; `provider` is a ready provider instead; `height` is a CSS length or `fill` (default 32rem). It wraps `js/code-explorer/element.js`, which gained a `search` attribute and method and an `initial-line` attribute for this. A developer's own snapshot: `node tools/snapshot.mjs <folder> <out.json>` (`collectSnapshot`: text files up to 512 KB, no `node_modules`, `.git`, `bin`, `obj`, `dist`; JS/TS declarations and CSS rules become the outline). Format: `js/code-explorer/providers.js` header. Sizes: the module 2.1 KB raw / 0.9 KB gz; the explorer runtime it loads (element, providers, tokenizer, css, support) about 41 KB raw / 13 KB gz.

### Scorecard

`mountScorecard(container, { targets, checks, themes, widths, historyKey, autorun, theme, height })` returns `{ run(), results(), destroy() }`. A target is a same-origin URL, `{ name, url }`, `{ name, html }` (markup in a frame with the SDK stylesheets), `{ name, srcdoc }` (string or function of `{ theme, width }`) or `{ name, samples }` (several frames scored as one). Each frame is rendered off-screen at every theme and width (defaults dark and light at 375 and 1024) and measured with `js/quality.js`, scored with `js/scoring.js`, ranked worst first. `checks` keeps findings whose check or category is listed. Another origin cannot be read and scores as one `unreadable` error. Also exported: `runTargets`, `openFrame`, `rankedTable`, so a host draws its own view; the SDK Scorecard page ranks its gallery controls through `runTargets` and keeps its performance, scale, size-sweep and security sections. 12 KB raw / 4.9 KB gz for the module and css. Verified in a real host page, light and dark, desktop and 375px (the ranked table scrolls sideways inside its own box on a phone). One mounted instance per page is the assumption of the gallery and theme modules; the scorecard is closure-based.

Tests for all of the above: `tests/mount-modules.test.mjs`, `tests/scorecard-module.test.mjs`, `tests/modules-dist.test.mjs`, `tests/gallery-options.test.mjs`, `tests/gallery-dist.test.mjs`, `elements/gallery/gallery.test.mjs`; browser cases in `tests/browser/cases-tools.js` (two) and `cases-data-display.js` (gallery, two), attested in `tests/browser/report.json` (105 cases at the last run).

## What is left (checklist)

- [ ] **Theme editor module**: `mountThemeEditor(container, options)`. The existing page is `site/theme/theme.js` (+ `theme.css`), pure logic already in `js/theme.js` and `js/colour.js`. Planned options: `target` (a Document, the default, gets one adopted stylesheet of override CSS; an Element gets the current theme's overrides as inline custom properties so only that subtree changes), `theme`, `onchange({ css, overrides })`, `tokens` (URL of the stylesheet whose token blocks are edited; dist needs its own `tokens.css` copy, like the gallery), `pairs` (contrast pairs; the page passes `TEXT_PAIRS` from `site/scorecard/scoring.data.js`, the module needs its own default), `storageKey`, `height`; returns `{ export(), overrides(), setTheme(name), reset(), destroy() }`. Approach that was started and set aside: move the page script into the module with page state in module scope (single instance), scope `$` to the mount root, replace `sampleDoc` with a preview frame built from the SDK stylesheets plus a tiny external `js/frame-init.js` (`initPlainkit()` for the frame; inline script is not allowed), keep the page as a host that passes `storageKey`, `pairs` and a site-theme bridge. Add `security.allow.json` sink counts for the new file (the old page's 6 move with it). Tag wrapper: probably not warranted (an editor with an export method is an app, not markup); decide when built.
- [ ] **Gallery gap 1**: the Elements overview (`site/gallery/elements-view.js`) ignores the `filter` option; Controls honours it. Make Elements honour it.
- [ ] **Gallery gap 2**: with `chrome="full"` the nav's section links open unscoped overviews. Make them respect the mount's `kind` / `group` / `control` / `filter` scope, or hide links outside it (`js/gallery-options.js` `restrictTree` already cuts the tree; the links come from the gallery's nav renderer).
- [ ] **Gallery gap 3**: view `chrome="full"` in a real host page (a throwaway page, removed afterwards) at desktop and 375px, dark and light, and fix what looks wrong.
- [ ] The app using `<pk-gallery>` for its component browser where it fits (app side, only after the move settles).

## Known follow-ups for the move and rename

- Rename the prefix `sdk-` to `pk-` (elements, tags in docs and browser cases, `pk-gallery-height` message type, `PkElement`, storage keys such as `pk-site-theme`, `pk-theme-overrides`, `pk-scorecard-history`, `pk-gallery-*`); the API-surface baseline (`site/scorecard/api.baseline.json`) will need a deliberate reset because the surface test only lets it grow.
- Licence: `dist/manifest.json` (written by `tools/build.mjs`) says "Proprietary, part of the repository"; it becomes MIT, plus a `LICENSE` file.
- Privacy scan of demo content before going public: samples, gallery data, `site/files/snapshot.json` (the SDK's own source, 2.9 MB), reports under `site/scorecard/`, guides, and any product or vendor names in sample text.
- The app-side publish step (a script that builds `dist/`, mirrors it into the app and regenerates the Blazor wrappers from `dist/elements/api.json`) belongs to the app repo after the move; `tests/carveout.test.mjs` already proves the folder stands alone.

## Housekeeping gotchas (each has bitten)

- **Line endings**: `.gitattributes` forces `eol=crlf`, every file under `sdk/` is CRLF on disk, the build emits CRLF and tests compare bytes. Never leave an LF-only file (a shell `sed -i` on Windows strips the CRs; check with a quick scan). Verify in an LF clone: `git -c core.autocrlf=false -c core.eol=lf clone --no-hardlinks . <tmp>` then in it `node --test "sdk/tests/*.test.mjs" "sdk/components/*/*.test.mjs" "sdk/elements/*/*.test.mjs"` (drop the `sdk/` prefix when the SDK is the repository root). `serve.mjs --write-reports` writes `report.json` with LF: convert it back.
- **Budget**: the `dist/plainkit.css` page layer has a 10 KB gzip budget with almost no headroom (`tests/budgets.test.mjs`). Add no page-level css; a tool's css belongs in its module folder and is loaded by the module.
- **CSP**: the whole site runs under `script-src 'self'; style-src 'self'`: no inline scripts, styles or handlers (`element.style.x = ...` through CSSOM is fine); `tests/security.test.mjs` and `tools/security.mjs` enforce it. A new `innerHTML` sink needs a counted, documented entry in `tools/security.allow.json`; raise a ceiling only with a reason and by the smallest amount. Any new top-level folder or file must be added to the allowed list in `tests/samples.test.mjs`.
- **Browser attestation**: any change to an element source, `js/element*.js`, `js/loader.js` or the browser cases makes `elements-attest.test.mjs` fail until you re-run the suite: `node tools/serve.mjs 5341 --write-reports`, open `/tests/browser/index.html` in a visible tab, wait about 15 s for "All N passed (report saved)". A hidden tab throttles timers and stalls the run.
- **Servers**: stop every `node ... serve.mjs` you start; a running server locks folders on Windows.
- **Shell quoting**: the shell mangles backslash-n and quotes inside `node -e` strings. Use the editor's Edit tool for single-line edits, or write a small script file.
- **Carve-out**: nothing under `sdk/` may name the host app (no source-tree paths, no app project names, no absolute user paths); `tests/carveout.test.mjs` fails on it, this file included.
- Build then test order: `node tools/build.mjs` (regenerates `plainkit.css`, gallery data and `dist/`), then the node tests. `dist/manifest.json` carries SRI hashes and the build is deterministic, so a rebuild of unchanged sources must be byte-identical.
