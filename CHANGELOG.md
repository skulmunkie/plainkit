# Changelog

All notable changes to Plainkit (the `plainkit` npm package and the `PlainKit.Blazor` NuGet package, versioned together).
The format follows [Keep a Changelog](https://keepachangelog.com/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

- Initial import of the toolkit.
- Added: performance monitor (`mountPerformance`), dev console (`mountConsole`) and dev tools (`mountDevTools`: a dock on any page, Ctrl+`, or inline), all built from SDK components.
- Added: `PlainKit.Blazor` (net10.0): `PkGallery`, `PkCodeExplorer`, `PkScorecard`, `PkPerformance`, `PkConsole`, `PkStyles`, the `/_plainkit` dev tools page, `PkSnapshot`; the package serves a copy of `core/dist` (`scripts/publish-dist.mjs`).
- Changed: Blazor component names are now `Pk` plus the tag in PascalCase (`pk-alert` is `PkAlert`, `pk-table` is `PkTable`); parameters are unchanged.
- Changed: site menu is Gallery, Files, Scorecard, Theme editor, Guides, Dev tools; the theme toggle moved into a settings menu with a Settings page; Templates and Spacing live in the Gallery tree.
- Fixed: `pk-alert` fired `pk-dismiss` twice per click; phone layout of the site top bar and the gallery playground.
- Fixed: the gallery Elements overview now honours the `filter` option like Controls, and with `chrome="full"` every overview (home cards, Foundations, Controls, Elements, Samples) lists only what the mount's `kind` / `group` / `control` / `filter` leave (`filterTree` in `js/gallery-options.js`).
- Fixed: the gallery in a host page: the chrome fills a fixed-height container, the docked inspector no longer covers the page content, element pages and the Display menu work without the host calling `initPlainkit`, sample frames no longer show a stray scrollbar, controls cards no longer end in "..", and the host page's own title is kept.
- Removed: the gallery's Quality checks (toolbar button, `#/quality/run` page, `offscreenFrame`); the Scorecard is the place for quality scoring.
- Changed: the build removes files in `dist/js` that no source produces any more (`staleDistJs`, tested); the leftover `dist/js/sdk.js` is gone.
- Changed: the old Spacing page (`site/spacing/`) only redirects to the gallery foundation `#/foundations/spacing`.
- Changed: the table and pagination element notes describe their behaviour in terms of `rows`, `columns`, `pk-sort`, `pk-filter`, `pk-page` and `pk-page-size`.
- Added: `core/STANDARDS.md` (naming, tokens, modules, the dist pattern, CSP, keeping SDK and Blazor in step) and `core/site/guides/PROPOSAL.md` (a docs engine built from existing components, with its gaps).
