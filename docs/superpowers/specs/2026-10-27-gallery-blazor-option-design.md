# The gallery as its own optional package: `plainkit.gallery` (design)

Status: owner APPROVED 2026-10-27 (direction); design only, no code. Follows `2026-10-20-separate-packages-design.md` (#1656). Steps are the briefs gallery-opt-b to gallery-opt-i.

## 1. Why

The gallery is the largest single payload of core-only Blazor apps and almost no deployed app shows it. Measured on `blazorPayload.coreOnly`: about -326 KB gzip when it leaves
(`gallery/elements/*.data.js` 242 KB, `gallery.data.js` 30.8, templates 20.6, `gallery-views.js` 7.8, patterns 6.3, `tokens.css` 5.2, chrome/runtime/`gallery.js` about 13). It becomes an
optional package with `blazorOption: "gallery"`, in `full` and on Pages, absent from core-only Blazor.

## 2. What moves

- Everything under `gallery/` in `core/dist`, today `siteOnly: ["gallery/"]` in `packages.json`: `gallery/embed.html`, the element data, templates, patterns, views and
  `boots/code-explorer.js` (it imports the modules unit; see `core/tests/dist-units.test.mjs` about lines 90-111, which name gallery files and the extras manifest).
- **Stays in core:** `dist/js/gallery-options.js` (`gallery-dist.test.mjs` line 22; `pk-gallery` imports it), the `pk-gallery` element and the Blazor `PkGallery`. `PkAssets.GalleryEmbed` points at
  a file that is absent without the option (documented, section 4).

## 3. Package declaration

- Remove the `siteOnly` entry (keep the key as `[]` only if `scripts/packages.mjs` needs it). Add `{ id: "plainkit.gallery", title: "Gallery", built: true, requires: ["plainkit"], blazorOption: "gallery", files: ["gallery/"] }`.
- `scripts/packages.mjs` `isSiteOnly` and `scripts/tests/packages.test.mjs` (about lines 67 and 81) adjust; the helper goes only if nothing else uses it.
- **Import rule.** `siteOnly` let the gallery import every package; a normal package may import only its `requires`. Use `requires: ["plainkit"]` and make imports of optional packages (canvas, dock,
  markdown, tools ...) dynamic and gracefully absent, as ceil-b did for the gallery element data. A scan of `core/gallery` and `core/site/gallery` found no static import of another package by name; gallery-opt-b
  re-runs the package import test on the real tree. If a static import of an optional package turns up, name it in the ready notes and make it a dynamic import with a "not installed" row in the gallery, not a `requires` entry.
- Ceilings are set in the last step (section 8); until then `maxPackedBytes: null`. If the tests refuse a package without ceilings, that step stops and reports; no number is guessed.

## 4. Blazor

- New option `Gallery` in the generated `PkExtra` enum. `scripts/generate-blazor.mjs` (`extraOptions`, `renderTargets`, `renderExtraEnum`, `renderExtrasJson`) takes tags from `p.elements`; the
  gallery has files and no elements, so confirm the entry `{ name: "gallery", id: "plainkit.gallery", tags: [], files: [every dist/gallery file] }` and that the `StaticWebAsset` and
  `StaticWebAssetEndpoint` `Remove` lines are written under the same condition as dock, canvas and markdown. Declared none = all (unchanged).
- `scripts/blazor-extras-publish.mjs` (`SETS`, `checkSet`, `checkPayload`): `core` publishes no gallery file, `full` and the default publish all, `dock` none of the gallery. Unit test of `checkSet` with a fake universe.
- **Dependents.** `PkDevToolsWorkspace.razor` (default workspace "gallery", templates under `gallery/templates/`, `PkGallerySection.ForBlazor`) belongs to the tools option. Without the gallery option its Gallery
  tab shows a one-line notice naming `PkExtra.Gallery` and the workspace opens on the Files tab. The behaviour lives in core (`core/modules/devtools/workspace.js`, SDK logger, node test); the razor file only passes
  data (no growth of `blazor/handwritten.baseline.json`, budgets only shrink). `PkAssets.cs`: the extras manifest keeps listing the gallery files; the `GalleryEmbed` doc says it needs the gallery option.
- **Samples.** `PlainKit.AppSample` `Program.cs` (`DevTools=true`, `AddPlainKitDevTools`, no option list) keeps the gallery, with a comment. Harness case `devtools-workspace`
  (`scripts/blazor-browser-lab-cases.mjs` about line 321) opens `/_plainkit`; Playground and WasmPlayground Home navigate to `/_plainkit`. `scripts/blazor-browser-select.mjs` selects that case for the new files.

## 5. Breaking change

Consumers that declare an explicit option list and use `PkGallery`, the dev tools Gallery tab or the templates must add `PkExtra.Gallery`. Consumers that declare nothing are unaffected.
Update: `PlainKit.Blazor.csproj` Description (line 6 says it ships the gallery), Blazor README (about lines 199, 501, 534), README, docs, `scripts/skills/` workflows, the site guides that list the options, a migration note
with before/after in the existing option syntax, and a changelog fragment of type `breaking` (`node scripts/changelog.mjs new breaking gallery-blazor-option --issue N`).
**Version.** Removing content from explicit-list builds is an API-surface and behaviour break; while 0.x it needs the minor bump that `node core/tools/versioning.mjs bump` reports. The release pull request runs it and states the result; this spec does not edit `core/VERSION`.

## 6. Tests that follow the owner

`core/tests/dist-units.test.mjs`, `gallery-dist.test.mjs`, `gallery-data-split.test.mjs`, `carveout-build.test.mjs`, `carveout-serve.test.mjs`, `package-size.test.mjs`, `scripts/ui-review-cache.mjs` (about line 73, `sitePart`) and
`scripts/tests/ci-changes.test.mjs`: change only expectations that encode "the gallery is core-owned / siteOnly" to the equivalent assertion on the new owner. Never weaken. The npm tarball must not grow.

## 7. Measured effect

`blazorPayload.coreOnly` about -326 KB gzip. `full` unchanged (within 1 KB). npm package-size ceilings unchanged: the gallery is already outside npm.

## 8. Ceilings (nothing is raised)

- `plainkit.gallery` `maxZipBytes` and `maxUnpackedBytes` = measured +1 percent via `scripts/set-ceilings.mjs` (owner rule 2026-10-25).
- `blazorPayload.coreOnly` lowered from 745062 to measured +1 percent of the final tree (about 414000); `blazorPayload.full` measured +1 percent but never above 1073700. Any computed value above its current value keeps the current one and is reported.
- Done only in the last step, on the runner's measurement of the integrated tree.

## 9. Steps

| Brief | Change | Depends on |
| --- | --- | --- |
| gallery-opt-b | `packages.json`, `scripts/packages.mjs`, packages test: claim `gallery/` | a |
| gallery-opt-c | generator emits `PkExtra.Gallery` and Remove lines, test | b |
| gallery-opt-d | `blazor-extras-publish.mjs` sets and test | c |
| gallery-opt-e | dev tools workspace notice, `PkAssets` doc, tests | c |
| gallery-opt-f | core tests and dist assertions follow the package | b |
| gallery-opt-g | samples, harness selection | c, e |
| gallery-opt-h | docs, skills, csproj text, migration note, breaking fragment | c |
| gallery-opt-i | ceilings, lowered only (needs the runner's measurement) | b to h |

## 10. Open questions for the owner

1. Dev tools Gallery tab without the option: notice plus Files tab (recommended), or hide the tab?
2. Should `tools` imply `gallery`? Recommended no: the 326 KB would return for every tools user.
3. Which release carries the breaking change (minor bump while 0.x)?
4. Should a core-only build warn at build time when `PkGallery` is used without the option? Recommended no, the runtime notice is enough.
5. Should `PkAssets.GalleryEmbed` throw a clear error when the file is absent, or only be documented? Recommended: document only.
