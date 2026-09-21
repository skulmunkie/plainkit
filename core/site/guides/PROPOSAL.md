# Proposal: a docs engine for the Guides page

Status: decided (owner decision D2: build it now, minimal, no search first) and partly built. The first slice differs from the proposal below in one way: a guide is a Markdown file
(`content/<id>.md`, front matter `title`, `order`, `summary`) that the build converts to sanitised HTML (`tools/markdown.mjs`, `tools/guides.mjs`), instead of JSON blocks with HTML fragments, so an
author writes plain text and the converter, not the author, decides what markup can appear. The page (`page.js`) is built from `pk-side-nav`, `pk-toc`, `pk-breadcrumb`, `pk-pager`, `pk-code-block`
and `pk-alert`; heading anchors (gap 2) and the authoring check (gap 5, as build errors) are done. Still open: full-text search, versions, tabs for HTML and Blazor alternatives. What follows is the
original proposal, kept for the reasoning.

## Goal

Help and developer guides shown by the site itself, made only from components that already exist in core. No markdown parser, no new dependency, no new widget. Rule of the repo: if core lacks something, it is listed as a gap, not built.

## Page model (no markdown)

A guide is data, not text to be parsed. One JSON file per guide, blocks in order:

```json
{ "id": "getting-started", "title": "Getting started", "section": "Basics", "order": 1,
  "blocks": [
    { "type": "heading", "level": 2, "text": "Install" },
    { "type": "html", "src": "install.html" },
    { "type": "code", "lang": "html", "text": "<link rel=\"stylesheet\" ...>" },
    { "type": "tabs", "tabs": [{ "label": "HTML", "blocks": [] }, { "label": "Blazor", "blocks": [] }] } ] }
```

- Prose is an HTML fragment in a sibling file, so an author writes plain `<p>`, `<ul>`, `<a>`. Fragments are inserted with the DOM (`template` + `importNode`), and each fragment is a counted, documented `innerHTML` sink in `tools/security.allow.json` (one sink for the renderer).
- A fixed set of block types maps to elements. Unknown types are shown as an error block, never dropped.
- An `index.json` lists the guides; the build (or the page at run time) reads it. Same shape as the gallery tree, so `restrictTree`-style scoping and `filterTree` (`js/gallery-options.js`) can be reused for nav and search.

## What each piece would use

| Need | Component | In core? |
|---|---|---|
| Navigation between guides | `pk-tree` (with `pk-tree-item`) for the section and guide hierarchy; `pk-side-nav` if the shell wants its own rail | yes |
| Page-to-page paging | `pk-pager` (previous / next between sibling pages) | yes |
| Paging inside a long list of guides | `pk-pagination` | yes |
| Tabbed alternatives (HTML / Blazor) | `pk-tabs`, `pk-tab`, `pk-tab-panel` | yes |
| Search box | `pk-input type="search"` | yes |
| Search matching | `filterLeaves` / `filterTree` in `js/gallery-options.js` (title match); full-text needs a small index | title search yes, full text is a gap |
| In-page table of contents | `pk-toc` (headings of a target, scroll-spy) | yes |
| Code samples | `pk-code-block` (label, line numbers, copy) | yes |
| Callouts | `pk-alert`, `pk-hint` | yes |
| Breadcrumb | `pk-breadcrumb` | yes |
| Live example next to its code | a `pk-gallery control="..."` frame, or `dist/gallery` embed | yes |
| Layout | `pk-app-shell` or the site shell (`site/shell.js`) | yes |
| Deep links and back button | hash routing like `site/gallery/gallery.js` (`#/guides/<id>`) | pattern exists, not a component |

## Gaps (not built, owner decides)

1. **Full-text search**: title search is free; searching body text needs an index built at build time (a JSON of words per guide) and a matcher. Small, but new code in `tools/` and `js/`.
2. **Heading anchors and copy-link**: `pk-toc` lists headings; giving every heading an `id` and a permalink button is not a component today.
3. **Versioned docs**: a version switch would be a `pk-select` plus a folder per version; nothing in core models versions.
4. **Guide-level metadata** (last updated, edit link): plain fields in the JSON, rendered as text; no component needed, but a convention.
5. **Authoring check**: a node test that every guide's blocks are valid and every internal link resolves. Easy, and worth doing first.

## Suggested order if approved

1. Block schema and a node-testable pure renderer (`js/guides-logic.js`: JSON to a tree of descriptions, no DOM).
2. A `mountGuides(container, options)` module in the usual dist pattern (`modules/guides/`), thin site page as its host.
3. Two real guides (Getting started, Embedding the gallery) to prove the model before anything else is added.
4. Then the gaps, in the order the owner wants.

## Size and risk

Estimated one module of a few hundred lines plus its tests, no new dependency, no page-level CSS (budget is full). Risk: fragments are HTML, so authors can write anything the CSP allows; the sink allow-list and the security scan already cover it.
