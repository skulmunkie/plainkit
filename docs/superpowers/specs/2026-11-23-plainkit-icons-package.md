# plainkit.icons: all icons in their own package (#111)

Status: proposal for owner decisions. Owner direction, 2026-11-23: "icons should be its own package. All icons. Even the base ones move to plainkit.icons." Every icon size limit is already lifted (#2108). This spec says what moves, how consumers find it, the step plan, the ceiling effects, and the questions the owner answers.

Facts below were read from the code on `main` at a560d5c3. Where I could not confirm something it says "unverified".

## 1. Current state: everything that reads or ships the sprite

The sprite is `core/icons.svg`: 86 symbols, 15,716 bytes raw, 3,455 bytes gzip (measured with `node core/icons/build.mjs`). It is generated from `core/icons/src/*.svg` (86 files), together with `core/icons/icons.json` (`{ "names": [...] }`) and `core/icons/icons.d.ts` (`PkIconName` union). All three are gitignored build output.

| Place | What it does today |
| --- | --- |
| `core/icons/build.mjs` (+ `icons.test.mjs`, `README.md`) | Lints and builds the three files above. First step of `scripts/bootstrap.mjs`. |
| `core/tools/build.mjs:221` | `w('dist/icons.svg', read('icons.svg'))`: copies the sprite to `dist/icons.svg`. icons.json and icons.d.ts are not copied to dist (unverified that nothing else ships them; the grep found no other reader). |
| `core/js/icon-sprite.js` | `spriteUrl()`: `<meta name="pk-icons">` content, else `../icons.svg` (from `js/` or `elements/`) or `../../icons.svg` (from `elements/icon/`) relative to the module. `iconHref`, `symbolIds`, `drawIcon` (fetches the sprite once, `warnOnce` if a name is not in it). Imported by `pk-icon`, `pk-button` (`icon-name`), `pk-table-filters`. |
| Other `pk-icon` users | About 25 core files draw icons through `<pk-icon name=...>` or `icon-name`: app-frame, page-header, data-table, record-form, list-page, doc-page, tray, card-menu, date-range-picker, lookup-picker, canvas, markdown-editor, `js/app/nav.js`, `js/app/shell.js`, `js/dock-render.js`, `js/field-extras.js`, `js/page-actions-overflow.js`. All resolve through the same `spriteUrl()`, so none needs to change if `spriteUrl` is. |
| `core/app.html`, `core/samples/app/index.html` | `modulepreload` of `js/icon-sprite.js` (the JS, not the sprite). |
| `core/package.json` | `files: ["dist", ...]` ships `dist/icons.svg` in the npm tarball; `exports` has `./dist/*` so `plainkit/dist/icons.svg` resolves. |
| `core/tests/package-size.test.mjs:32` | `DIST` allow-list of top-level dist entries includes `icons.svg`. |
| `packages.json` | Core `plainkit` owns every file no other package claims, so it owns `icons.svg`. Core `maxPackedBytes` 291,492 (the packed size is 289,862 per the task brief; headroom about 1.6 KB, which is what blocks new icons). |
| Package zips | `scripts/build-packages.mjs` puts `icons.svg` in `plainkit-<version>.zip` via the "core owns the remainder" rule. `scripts/check-package.mjs` checks zips against `dist` and `packages.json`. |
| Blazor | `scripts/publish-dist.mjs` copies `core/dist` to `blazor/src/PlainKit.Blazor/wwwroot/plainkit/` (so `_content/PlainKit.Blazor/plainkit/icons.svg`); the generated `PlainKit.Blazor.targets` drops an extra's files with `StaticWebAsset Remove` lines per option (`generate-blazor.mjs` ~590). Today `icons.svg` is a core file, never dropped, so it counts in `blazorPayload.coreOnly` (745,062) and `full` (1,110,513). |
| Blazor typed names | Not built. `core/icons/README.md` has a TODO for a `PkIconName` constants class. |
| `core/site/gallery/paths.js:12` and `core/tools/gallery-dist.mjs:24` | `ICONS = '../../icons.svg'` (source) and `'../icons.svg'` (dist) for the gallery icon grid (`gallery-views.js:120`). |
| `core/tools/bundle-page.mjs` | `--flat` copies `dist/icons.svg` to `plainkit-icons.svg` and rewrites `icon-sprite.js`'s `"../icons.svg"` to `"./plainkit-icons.svg"` (`FLAT_REWRITES`); the non-flat output keeps it at the top. `core/tests/bundle-page.test.mjs` 71-82 assert the file and the rewrite. |
| Custom SDK export | The custom-SDK builder works on the shipped file map: `core/tests/custom-sdk-logic.test.mjs` (132, 232) treats `dist/icons.svg` as an ordinary unchanged shipped file. No dedicated icon code found in `core/js/custom-sdk*.js` (grep for "icons" returned nothing there); unverified whether the export zip lists `icons.svg` by name or by the "everything in dist" rule. |
| Pages | `scripts/build-pages.mjs` `INCLUDE` lists `icons.svg` at the site root (source layout, for the gallery and `app.html`) and `dist/` (which carries another copy). Extras are copied to `packages/<id>/`. |
| Tests | `core/tests/icon-sprite.test.mjs`, `core/elements/icon/icon.test.mjs` (reads the built sprite and checks the symbols the elements use), `core/tests/browser/cases-*.js` (forms, icon-time, overlays, tools), `core/tests/samples.test.mjs` (allowed top-level names include `icons`). |
| `.gitignore`, `scripts/generated.mjs` | List `/core/icons.svg` (and icons.json, icons.d.ts) as generated. |
| Docs and skills | `scripts/skills/plainkit-sdk/SKILL.md` (icon buttons, `icon-name`), `core/site/guides/content/getting-started.md:107` (`<meta name="pk-icons">`, the bundle page's `plainkit-icons.svg`), `core/README.md`, `docs/tool-modules.md`, `core/icons/README.md`. |
| Ledger | `core/tests/budget-ledger.json` has per-package entries (e.g. `package-ide-zip`, `movedBy: scripts/set-ceilings.mjs`). I did not find an icon-specific entry; the sprite is only inside the core and payload entries. |

The sprite is already a single static file addressed by URL; no element inlines or imports it. That is what makes the split cheap.

## 2. Target design

### Package

`plainkit.icons`, same version as core (`core/VERSION`; `core/tools/versioning.mjs` already stamps every built package), a `packages.json` entry:

```
{ "id": "plainkit.icons", "title": "Icons", "built": true, "requires": ["plainkit"],
  "blazorOption": "icons",
  "files": ["icons.svg", "icons.json", "icons.d.ts"],
  "maxPackedBytes": null, "maxUnpackedBytes": <measured+1%>, "maxZipBytes": <measured+1%> }
```

Built by `scripts/build-packages.mjs` exactly like `plainkit.ide` (a `files` claim): folder `dist-packages/plainkit.icons/`, zip `plainkit.icons-<version>.zip`, manifest `plainkit.icons.manifest.json` with SRI hashes and `requires` core at the exact version, a copy under Pages `packages/plainkit.icons/`. Unzipping it over the core folder reproduces `dist/icons.svg` where `spriteUrl()` already looks (the existing layout rule for extras), so the default resolution needs no new rule.

`OPTIONAL` in `scripts/set-ceilings.mjs` gains `plainkit.icons` (test fails otherwise), so its ceilings follow measured + 1% by the owner's rule.

### Files in the package

| File | Purpose | Note |
| --- | --- | --- |
| `icons.svg` | The sprite. | Same path as today. |
| `icons.json` | `{ "names": [...] }`. | Needs to be copied into dist (today it is not). Lets tools and the Blazor generator read names without parsing SVG. |
| `icons.d.ts` | `PkIconName` union. | Also copied into dist. |
| Blazor `PkIconName` (C#) | `static class PkIconName { public const string Search = "search"; ... }`. | The README TODO. Generated from icons.json by `generate-blazor.mjs` (a small `.cs` emitter), compiled into `PlainKit.Blazor` (a few KB of IL for 86+ names; see decision 5). |

On npm, plainkit core stays the only npm package (extras are zips and Pages folders, never npm: `packages.json` header, `core/package.json`). "Its npm name" is therefore a question: see decision 2.

### Source and build

Recommendation: the source SVGs and the build move with the package, and the lint is unchanged. Concretely `core/icons/` stays where it is as a source folder (the build is dev-time, nothing ships it) but `packages.json` claims the three outputs. Moving the folder to `icons/` at the repo root, or `packages/icons/`, is a pure rename with no consumer benefit and a CRLF/`.gitattributes` and path churn (`generated.mjs`, `.gitignore`, `icons.test.mjs`, README links), so it is optional and last (step 7). `bootstrap.mjs` order stays: icons first, then core build.

Note a repository fact: `core/tools/build.mjs` reads `core/icons.svg` (source-layout location, used by Pages and the gallery) and writes `dist/icons.svg`. The `build-packages` assembly reads from `dist`, so only the ownership declaration changes, not the build order.

## 3. How consumers resolve it

### Resolution (spriteUrl)

`spriteUrl()` stays the single place. Precedence, unchanged: (1) `<meta name="pk-icons" content=...>` (same origin), (2) path beside the module. Delivery by delivery:

| Delivery | Where the sprite is | Needs to change? |
| --- | --- | --- |
| Pages / the repo (source layout) | `core/icons.svg` | No. |
| npm `plainkit` (CDN such as unpkg/jsDelivr of the tarball) | Not in the tarball any more. The page needs the `pk-icons` meta, or the icons zip unpacked next to the SDK. | Yes: docs and Getting started. Open question: an npm tarball without the sprite means `npm i plainkit` gives blank icons by default (see decision 1 and 2). |
| Release zips | `plainkit-<v>.zip` (core) plus `plainkit.icons-<v>.zip`; unzip both into one folder. | Docs only. |
| Blazor static assets | `_content/PlainKit.Blazor/plainkit/icons.svg` when the option is on; dropped by a generated `StaticWebAsset Remove` line when not. | The `icons` option set (below). `spriteUrl()` finds it beside the modules, as today. |
| Bundle page (`bundle-page.mjs`) | `plainkit-icons.svg` beside the bundle when `--flat`. | Include by default; a `--no-icons` flag omits it and the `FLAT_REWRITES` entry. |
| Custom SDK export | The export is a subset of shipped files. | Add icons.svg as a selectable, default-on file; unverified where it is chosen (see section 1). |

### When the package is absent

Today a missing name logs once per element and name (`drawIcon` -> `warnOnce`, only if the sprite loaded and lacks the symbol). A missing sprite file is different: the `<use href>` points at a 404, the browser draws nothing, and `spriteSymbols()` swallows the fetch error at debug level (`log.debug`, so a developer sees nothing).

Proposed behaviour, all in `core/js/icon-sprite.js`:

- `pk-icon` and `icon-name` render nothing (blank, as now for an empty name). No placeholder glyph: a placeholder would shift layout differently from the real icon and look like a design choice. Icon-only buttons keep their accessible name (the text is the name; icon-name never carried it).
- If the sprite itself cannot be fetched (HTTP error, not a CORS-opaque case), log once per page through the SDK logger at warn level: `icons: the sprite at <url> could not be loaded; install plainkit.icons or set <meta name="pk-icons">`. This changes the current debug-level message for the not-found case; the CORS or offline case stays at debug (it cannot be told from "absent"). A non-silent failure matches the repo rule ("No silent failure").
- No built-in fallback for the glyphs core elements draw themselves (chevron, x, check, and so on): see section 6.

### Included by default

Recommendation: yes, everywhere, removable. It keeps every existing install working with no change.

- Blazor: the `icons` option is declared in `packages.json` (`blazorOption: "icons"`), is part of "none chosen means all" (`PkOptions.Extras`: "None chosen means all"), so `PlainKitExtras` unset behaves as today. A project that sets `PlainKitExtras` explicitly and omits `icons` loses the sprite. The extras publish check (`blazor-extras-publish.mjs`) gets `icons` in its existing sets: `default` and `full` declare all (sprite present), `core` declares none (sprite absent, and `coreOnly` drops by its size), `dock` declares one. Whether a hand-written wrapper needs a `PkExtraCheck` for icons is unverified; the per-component requirement mechanism (`PkExtraRequirements.cs`) names components, and icons are used by nearly all of them, so a startup check ("icons not published") may be better than per-component. See decision 4.
- Bundle page: included by default, `--no-icons` to omit.
- npm: the exception. The tarball is core-only today; if the sprite leaves it, the default experience for `npm i plainkit` changes. Decision 2.

## 4. Migration: steps that each leave `main` releasable

Each step is at most about 400 hand-written lines; generated files do not count. Targeted checks are `node scripts/verify.mjs --changed`.

| # | Step | Keeps working | Test | Gate effect |
| --- | --- | --- | --- | --- |
| 1 | Copy `icons.json` and `icons.d.ts` into `dist` (`core/tools/build.mjs`), add them to the package declaration of nothing yet; `core/icons/build.mjs` unchanged. | Everything (new files only). | A test that dist has both and they match the 86 names. | Core packed size up by about 1 KB (names list; d.ts) while the ceiling has 1.6 KB headroom: could be tight. Fold into step 2 if so, or skip until the sprite leaves (decision 3). |
| 2 | Add the `plainkit.icons` entry to `packages.json` with `built: true`, `OPTIONAL` in `set-ceilings.mjs`, add it to the ledger test list if per-package entries need one (`package-icons-zip`), claim the three files, and let `build-packages` assemble it. Core `files` in `package.json` adds `!dist/icons.svg`, `!dist/icons.json`, `!dist/icons.d.ts` so the npm tarball drops them. Core's Pages copy and the zip keep the sprite only in the icons package. | Pages and the repo (source layout) are unchanged: gallery and `app.html` use `core/icons.svg`. A dist consumer still has `dist/icons.svg` locally; only the packed/zipped artifacts split. | `scripts/tests/packages.test.mjs` (claims partition core), `scripts/check-package.mjs --zips` for the new zip, `package-size.test.mjs` (the DIST allow-list: remove `icons.svg` from the core allow-list in the same step). | Core packed ceiling can then be reset down by the orchestrator (section 5); icons ceilings set to measured + 1% by `set-ceilings.mjs`. |
| 3 | `spriteUrl` / `drawIcon`: warn once on an unloadable sprite, with the install hint. | All current behaviour; only the not-found diagnostic is new. | Extend `core/tests/icon-sprite.test.mjs` (a fetch stub that returns 404: one warn, no throw, nothing drawn). | None. |
| 4 | Blazor: `blazorOption: "icons"`, regenerate the targets and the extras table, add the option to the four publish sets in `blazor-extras-publish.mjs`; `blazor/handwritten.json` is unaffected (no hand-written file) unless a check class is added. | Apps with no `PlainKitExtras` set get the sprite as before. | `node scripts/blazor-extras-publish.mjs` and the generator tests (`scripts/tests`), a bUnit test that `PkOptions` with explicit extras but no icons logs the startup hint (if decision 4 picks a check). | `blazorPayload.coreOnly` drops by the sprite's gzip size (about 3.5 KB) after the orchestrator runs `set-ceilings`; `full` unchanged in principle. Note `coreOnly` is hard and never raised. |
| 5 | Bundle page and custom SDK export: `--no-icons`, default on; `bundle-page.test.mjs` extended; the custom SDK file picker lists the sprite as its own item. | Default output byte-identical to today. | `core/tests/bundle-page.test.mjs`, `custom-sdk-logic.test.mjs`. | Bundle size reported for a page that opts out drops by about 3.5 KB gzip. |
| 6 | Generate the Blazor `PkIconName` constants (`generate-blazor.mjs` emitter, `Generated/PkIconName.cs`, a test that it covers icons.json and a Pk-prefixed name rule from `blazor-wrapper.test.mjs` still passes: the class is generated, not hand-written). Docs and skills: `scripts/skills/` (sdk and blazor workflows), getting-started, gallery icon page text ("The sprite sdk/icons.svg" becomes the package's), `core/icons/README.md` TODO removed. | Everything. | `scripts/tests/blazor-wrapper.test.mjs`, a new constants test, a dotnet test that names exist. | None. |
| 7 (optional) | Move `core/icons/` (source, build, tests) to its own top-level folder. | Everything. | `generated.test`, `icons.test.mjs` with new paths. | None. |

After step 2 the sprite no longer counts against core's packed ceiling, which unblocks adding icons (#111 batches). Step 1 may merge into 2 depending on measured headroom; unverified, needs a measurement on the integration tree.

## 5. Ceilings

| Budget | Today | After | Who sets it |
| --- | --- | --- | --- |
| Core packed (`plainkit.maxPackedBytes`, `package-size.test.mjs`) | 291,492 (measured 289,862) | Drops by about 3.5 KB of packed size once the sprite leaves the tarball (measured gzip of the sprite 3,455; npm packs gzip). Lower it to the new measure. | Core stays a one-way ratchet: an orchestrator reset via `set-ceilings.mjs` on the integration tree; I do not know whether the script lowers core ceilings or only refuses raises (it classifies core as ONE_WAY and reports raises as refused, so a downward move is likely hand-edited in the final gate; unverified). |
| Core zip, unpacked | per `packages.json` | Drop by the sprite's zip and raw size (15,716 raw). | Same. |
| Blazor payload `coreOnly` | 745,062 | Drops by about 3.5 KB gzip when `icons` is a removable option. Hard gate, only lowered. | Orchestrator. |
| Blazor payload `full` | 1,110,513 | Unchanged in principle (the sprite is still in the full set), but an extra file adds the endpoint overhead; the rule "measured + 1%" applies. | `set-ceilings.mjs`. |
| Bundle page | includes the sprite | Default unchanged; opt-out smaller. | n/a (no ceiling on sprite, page-weight pages not affected: pages request the sprite as a fetch of `<use>`, same as today). |
| `plainkit.icons` zip / unpacked | new | Measured + 1% on the first build, then again each time icons are added. Owner has said icon size is unlimited, so this is a measured tracking ceiling, not a limit anyone should design to. | `set-ceilings.mjs` only; branches do not edit it. |

The rules do not change: no branch edits a ceiling by hand, optional-package ceilings are set by `set-ceilings.mjs` on the integration tree to measured + 1%, core and the hard Blazor gates only go down. Because the owner said icon size is unlimited, the ledger should record the icons ceilings as `class: ratchet` with `movedBy: scripts/set-ceilings.mjs` like `package-ide-zip`, and a later decision may drop the ceiling check entirely for this one package (decision 7).

## 6. Risks and alternatives

Risks:

- **Default npm experience.** `npm i plainkit` no longer includes icons unless decision 2 keeps them in. Blank icons in a new project is the worst case; the warn-once helps but is a regression of the first-run experience.
- **Layout without icons.** Elements reserve space for an icon (the `<svg>` is sized by CSS); a missing sprite draws an empty box, not a collapse. Unverified in the browser; step 3's test should measure it.
- **Core elements need a few glyphs.** `pk-select`, `pk-dialog`, date picker, and so on draw chevrons and X's. I did not verify which are `pk-icon` references versus inline SVG; the grep shows many core components use `pk-icon`. If any core control needs an icon to be usable (a close button), a blank box in the base install breaks usability.
- **Two-file versioning.** The sprite and core must stay at the same version; `requires` plus the manifest hash handle that, as for the other extras.
- **A same-origin requirement.** SVG `<use>` cannot cross origins: a CDN-hosted core plus a self-hosted sprite needs the `pk-icons` meta; already true today.

Alternatives considered:

| Option | Pro | Con |
| --- | --- | --- |
| A. Whole sprite in `plainkit.icons`; core has none (the owner's direction). | One place, no size pressure on core, matches the owner's words. | Core alone draws nothing. |
| B. Core keeps a tiny built-in subset (the glyphs core elements need, about 15 icons, 2 to 3 KB); `plainkit.icons` has the full set. | Core is usable alone; blank icons never break a control. | Two sprites to keep in sync, a second `spriteUrl` fallback, duplicate symbols, and the owner said "even the base ones move". Counts against core's ceiling again, though small. |
| C. Load the sprite lazily (a `fetch` + inline injection on first icon use). | No request until needed. | Today it is already one cached file the browser fetches lazily on first `<use>`; this adds JS (core budget) for no gain, and CSP-friendly inline injection of fetched SVG is an `innerHTML` sink counted in `security.allow.json`. |
| D. Inline per-icon (an `<svg>` of the symbol in each element, or per-icon files). | Only used icons ship. | A real redesign (per-icon requests or a build-time tree shake), breaks `icon-name` strings that are data, not code; ruled out here. |

Recommendation: A, with a layout guarantee from step 3 (a missing sprite never changes the control's size), plus, if the owner is uneasy about blank first-run icons, include the sprite in the npm tarball while keeping it a separate package for zips, Pages and Blazor (decision 2, option b). B is the fallback only if a core control turns out to be unusable without an icon, which step 3 or a browser case would show.

## 7. Decisions for the owner

1. **Is the sprite still in the `plainkit` npm tarball?**
   a. No: removed, `npm i plainkit` has no icons until the user adds the package/meta. Consequence: smallest core, a worse first run, docs must say so loudly.
   b. Yes in the tarball, but its files are also the separate `plainkit.icons` package for zips, Pages and Blazor. Consequence: core's packed ceiling does not drop (the sprite still counts there), so adding icons still presses on it: this fails the stated goal unless the core ceiling treats it as an exception.
   c. A real second npm package `plainkit.icons` (a publish target). Consequence: this is the only way to have an npm name for it, but "extras are never npm" is a standing rule (`packages.json`, `core/package.json`) and publishing needs the owner (tags and registries).
   Recommendation: a (no, remove) with a loud docs note and the warn-once diagnostic, combined with decision 2 below if a package name on npm is wanted. Honest note: b contradicts the goal; I include it only so it is rejected knowingly.

2. **Does `plainkit.icons` get an npm name?** Options: never npm (zip and Pages only, like the other extras); npm later. Recommendation: never npm for now. Consequence: npm users get icons via the Pages/zip file or the `pk-icons` meta; if that is unacceptable, this reopens "extras are npm-less".

3. **Where do `icons.json` and `icons.d.ts` ship?** Options: in `plainkit.icons` only (recommended, they describe the sprite); also in core. Consequence: with core, they count toward its packed size (small, but it is the ceiling we are trying to relieve).

4. **Blazor option and absence behaviour.** Options: a named option `icons` (default on, removable) plus a startup log if the option is chosen explicitly without it (recommended); no option at all (icons always ship in Blazor, so the removal win is only for the npm/zip path); a build-time failure when an app sets extras without `icons`. Consequence: the recommended path adds a `PkOptions` log and a `coreOnly` drop; the second keeps `coreOnly` unchanged.

5. **Typed `PkIconName` constants.** Options: generate the C# class now (step 6, recommended) and put it in `PlainKit.Blazor` (always present, so apps without the package get names for files that are not there); or put it in the optional package only. Consequence: always present costs a few KB of IL in the Blazor assembly and gives the compile-time check, at the price of naming an icon the app did not install.

6. **Source folder move.** Options: keep `core/icons/` (recommended); move to `icons/` or `packages/icons/` (step 7). Consequence: moving is only tidiness, and touches `.gitignore`, `generated.mjs`, tests and docs.

7. **Ceilings for an unlimited package.** Options: measured + 1% like other optional packages (recommended; one rule); no ceiling at all for this package (an owner exception to the ledger, since "icon size is unlimited" is already the stated policy). Consequence: with measured + 1% every icon batch needs a `set-ceilings` pass on the integration tree, which is the exact friction the owner wants gone; dropping the ceiling removes that, but it breaks the "every built package has a ceiling" test and needs a documented carve-out in the ledger.

8. **Default inclusion.** Options: included by default everywhere (Blazor option set, bundle page, custom SDK), removable (recommended); opt-in. Consequence: opt-in changes every default delivery and is a breaking change.

9. **Fallback for glyphs core elements need.** Options: none, blank (recommended, with the layout guarantee); a tiny built-in subset (alternative B). Consequence: none is consistent with "even the base ones move"; the subset keeps a control like a close button usable with core alone but puts a small sprite back in core and a second resolution rule in `spriteUrl`.

## 8. What I could not verify

- Whether `set-ceilings.mjs` can lower a core ceiling or only reports raises (it refuses raises; a downward move may be by hand at the final gate).
- Exactly where the custom SDK export decides which files go in the zip (no icon-specific code found).
- Core's real packed size after removing the sprite (estimated from the 3,455 gzip bytes; the tarball gzip of a whole file set differs slightly).
- Whether a hand-written Blazor component or `PkExtraCheck` is the right absence signal for an extra used by almost every component.
- Which core controls draw glyphs through `pk-icon` that would be unusable if blank (about 25 files reference icons; not individually reviewed).
