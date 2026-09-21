# Changelog fragments

`CHANGELOG.md` is written by the release pull request, not by feature pull requests. Every pull request that changes more than documentation
adds one small file to `changelog/unreleased/`; two pull requests never touch the same lines, so the changelog cannot cause a merge conflict.

## Adding a fragment

```
node scripts/changelog.mjs new fixed pk-tabs-arrow-keys --issue 52
```

creates `changelog/unreleased/52-pk-tabs-arrow-keys.md` (without `--issue` the name starts with a timestamp). Replace the placeholder with the entry.

Types: `added`, `changed`, `fixed`, `removed`, `breaking`, `notes`. A `breaking` entry lands under `### Breaking` and needs a matching version
bump (`CONTRIBUTING.md`, "Versioning and releases").

## Format

One entry per file: a short front matter, then the entry as one paragraph (it may wrap over lines; no blank line, no list, no heading).

```markdown
---
type: fixed
issue: 52
---
`pk-tabs` moves focus with the arrow keys again after a tab is closed; the selected tab is the one that gets focus.
```

- `type` is required. `issue` is optional; the compiled line ends with `(#52)` unless the entry already mentions `#52`.
- Instead of front matter, the first line may be `type: fixed` followed by the entry.
- File names are `<issue-or-timestamp>-<slug>.md`, lowercase with hyphens. Nothing else may live in `changelog/unreleased/` except `.gitkeep`.
- Write for a user of the toolkit: what changed and what to do about it. Name the elements, exports or components. Issue and pull request numbers go in `issue:`.

## The checks

- `node scripts/changelog.mjs check` validates every fragment (type, non-empty, one entry, no stray files).
- `node scripts/changelog.mjs check-pr --base origin/main` fails when a pull request changes anything except docs (`*.md`, `changelog/**`) and adds no fragment.
  CI skips it when the pull request has the label `no-changelog`; say why in the description (a refactor with no visible effect, CI or tooling only).
- On a release pull request (`core/VERSION` changed) CI also fails while fragments are left.

## Releasing

In the release pull request: `node scripts/changelog.mjs compile --version X.Y.Z [--date YYYY-MM-DD]`. It moves every fragment into a new
`## [X.Y.Z] - date` section of `CHANGELOG.md`, grouped `### Breaking`, `### Added`, `### Changed`, `### Fixed`, `### Removed`, `### Notes`,
leaves an empty `## [Unreleased]` and deletes the fragment files.

Bullets already under `## [Unreleased]` (written before fragments existed) are merged in and classified by their prefix: `Changed (breaking):`
and `Removed (breaking):` are Breaking; `Added:`, `Changed:`, `Fixed:` (also `Fixed (docs):`) and `Removed:` go to their section; a bullet with
none of these prefixes is a Note. Fragment entries follow the legacy bullets within a section, in file-name order.
