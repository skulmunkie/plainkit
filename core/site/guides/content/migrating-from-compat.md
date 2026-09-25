---
title: Migrating from the class-based components
order: 7
summary: The retired chip/btn-*/card-header/... class vocabulary, its pk-* replacements, and a dev-mode check that finds every retired class still on a page.
---

## What changed

Before the `pk-*` custom elements, Plainkit shipped an older, class-based component vocabulary: a `plainkit-compat` stylesheet with classes like `chip`, `btn-primary`, `card-header`, `remedy` and `form-row`. That layer (`core/components/` and the compat stylesheet) was removed once every component had a `pk-*` element to replace it (see the changelog entry "Remove the class-based components").

An app that still vendors the old compat build and moves to the current package keeps building and keeps passing tests, but every element that still carries one of the retired classes silently loses its styling: a status pill becomes bare text, a card header's title and actions fall onto two rows, a class-styled button becomes a browser-default button. Nothing about that is an error, so nothing warns you — until you use the check below.

## Find them automatically

`js/compat-warn.js` is a small, opt-in module: it costs nothing on a page that doesn't import it (it is not part of `initPlainkit` or any base bundle). During a migration, import it once and call `checkCompatClasses()`:

```js
import { checkCompatClasses } from './plainkit/js/compat-warn.js';

checkCompatClasses(); // scans the whole document once, then watches for later additions
```

It logs a `warn` entry (scope `compat`) the first time it finds each retired class anywhere in the document, naming the class and its replacement, for example:

```text
[pk:compat] .chip is a retired Plainkit class (removed with the class-based components): use pk-badge or pk-tag instead
```

Like every other Plainkit warning, this goes through the logger (see the [Logging](logging.md) guide), so it shows up in the console at the default level and can be routed anywhere your own log sinks go. Remove the `checkCompatClasses()` call once the migration is done — it is a migration aid, not something to leave running in production.

## Removed utility classes

`core/base/utilities.css` dropped 107 of its 121 one-off `u-*` classes. Only `u-contents u-m0 u-mt-3 u-text-xs u-text-sm u-w-full u-ml-auto u-flex-1 u-fs-1p05r u-fs-1p1r u-fw-600 u-mw-24r u-p-1r-1p25r u-sr-only` remain. `checkCompatClasses()` flags every other `u-*` class and computes the replacement from its name (`p` = decimal point, `r` = rem, so `u-mt-p6r` is `margin-top: .6rem`):

- Spacing (`u-m*`, `u-p*`) snaps to the space scale (`--space-1..6, 8, 12` = .25 to 3rem): `u-mt-p6r` becomes `mt-2`, `u-mb-p75r` becomes `mb-3`; shorthands and left/right sides become a declaration in your own stylesheet, e.g. `margin: var(--space-3) 0 var(--space-1)` (the steps also have names: `--space-2xs`, `xs`, `sm`, `md`, `lg`, `xl`, `2xl`, `3xl` = 1, 2, 3, 4, 5, 6, 8, 12).
- `u-nowrap` is `.nowrap`; `u-text-md` is `font-size: var(--text-read)`.
- Colour, width, max-width, font size and weight, alignment, cursor and the rest have no scale: write the one declaration in your own stylesheet, using a token where one matches.

## The full map

Not everything from the old compat stylesheet was retired: the page-level layer — utilities (`u-*`, `p-*`, `m-*`, `gap-*`), `flow`/`stack`, typography (`lead`, `prose`, `mono`, ...) and the table-content helpers — moved into `core/base/` unchanged and still works. The table below covers what was actually removed: every class from a deleted `core/components/*` folder, grouped by the old component.

| Retired class | Replace with |
|---|---|
| `btn-primary` / `btn-secondary` / `btn-ghost` / `btn-warn` | `pk-button variant="primary\|secondary\|ghost\|warn"` |
| `btn-mini` | `pk-button size="mini"` |
| `btn-group` | `pk-button-group` |
| `chip`, `chip-btn` | `pk-badge` (static) or `pk-tag removable` (dismissible/interactive) |
| `chip-muted` / `chip-info` / `chip-accent` / `chip-success` / `chip-warn` / `chip-danger` | `pk-badge variant="muted\|accent\|accent\|ok\|warn\|danger"` |
| `card-header` | `pk-card heading="..."` |
| `cluster`, `cluster--horizontal`, `cluster--vertical` | `pk-cluster` (`orientation="vertical"` for the vertical variant) |
| `empty-state`, `empty-state-title`, `empty-state-description`, `empty-state-actions` | `pk-empty-state` (`heading`, `description`, `slot="actions"`) |
| `form-grid` | `pk-form` or `pk-grid` |
| `field-help` / `field-error` | `pk-hint` (`tone="error"` for the error case) |
| `input-group` | `pk-input` with a `slot="prefix"`/`slot="suffix"` |
| `switch` | `pk-switch` |
| `pagination`, `page-link` | `pk-pagination` |
| `pills` | `pk-tabs` |
| `pill` | `pk-tag` or `pk-badge` |
| `stepper` | `pk-stepper` |
| `list-group` | `pk-list-group` |
| `accordion` | `pk-accordion` |
| `progress` | `pk-progress` |
| `spinner` | `pk-spinner` |
| `skeleton` | `pk-skeleton` |
| `toast` | `pk-toast` |
| `avatar` | `pk-avatar` |
| `timeline` | `pk-timeline` |
| `divider` | `pk-divider` |
| `tip` | `pk-tooltip` |
| `job-panel`, `upload-accepted` | `pk-dropzone` |
| `flyout-panel`, `flyout-backdrop` | `pk-drawer` |
| `flyout-panel--wide` | `pk-drawer wide` |
| `flyout-panel--docked` | `pk-drawer docked` |
| `flyout-resize-handle` | `pk-splitter` |
| `flyout-header` / `flyout-body` / `flyout-footer` | `pk-drawer` heading, default slot, `slot="footer"` |
| `flyout-actions` | `pk-form-actions` |
| `form-row` | `pk-field-row` |
| `ff`, `ff--wide`, `ff--compact` | `pk-field` |
| `ff--inline` | `pk-field-row align="center"` |
| `ff-required` | `pk-field required` |
| `ff-hint` | `pk-hint` |
| `chk`, `chk--compact` | `pk-checkbox` |
| `dg`, `dg-body`, `dg-cards` | `pk-table` (`cards` for the card layout) or `pk-grid` |
| `dg-toolbar` | `pk-toolbar` |
| `dg-filters`, `dg-filter`, `dg-filterrow` | `pk-table-filters` |
| `dg-search` | `pk-input` |
| `dg-pager` | `pk-pager` |
| `dg-sortable` | `pk-table sort` |
| `dg-select-cell` | `pk-table selectable` |
| `icon--xl` | `pk-icon size="xl"` |
| `gal-gallery`, `gal-item` | `pk-image-gallery` or `pk-gallery` |
| `gal-badge` | `pk-badge` |
| `gal-actions` | `pk-image-gallery slot="actions"` |
| `gal-add` | `pk-dropzone` |
| `loading` | `pk-loading-overlay` or `pk-spinner` |
| `maint-section`, `maint-section-header` | `pk-detail-layout` or `pk-page-header variant="section"` |
| `modal-overlay`, `modal-card` | `pk-dialog` |
| `modal-body` | `pk-dialog` (default slot) |
| `modal-footer` | `pk-dialog slot="footer"` |
| `snav`, `snav-link`, `snav-group-title` | `pk-side-nav`, `pk-nav-item` |
| `snav--collapsed` | `pk-side-nav collapsed` |
| `tnav`, `tnav-link`, `tnav-brand` | `pk-navbar`, `pk-nav-item` |
| `tnav--open` | `pk-navbar open` |
| `mobile-nav-toggle` | `pk-navbar` (its built-in toggle) |
| `dropdown`, `dropdown-menu` | `pk-dropdown` |
| `dropdown-item` | `pk-menu-item` |
| `notice`, `notice-title` | `pk-alert` |
| `notice--error` / `notice--warning` / `notice--info` / `notice--success` | `pk-alert kind="danger\|warning\|info\|success"` |
| `notice-dismiss` | `pk-alert dismissible` |
| `remedy`, `remedy-body`, `remedy-actions` | `pk-alert banner` (default slot, `slot="actions"`) |
| `remedy--error` / `remedy--info` | `pk-alert kind="danger\|info" banner` |
| `page-header`, `page-header-titlebar` | `pk-page-header variant="page"` |
| `page-header-actions` | `pk-page-header slot="actions"` |
| `page-crumbs` | `pk-breadcrumb` |
| `record-header`, `record-header-title` | `pk-page-header variant="record"` |
| `record-header-actions` | `pk-page-header slot="actions"` |
| `shell-body`, `shell-main` | `pk-app-shell` |
| `shell-footer` | `pk-app-shell slot="footer"` |
| `shell-backdrop` | `pk-app-shell` (its built-in backdrop) |
| `sticky-header` | `pk-app-shell sticky` |
| `form-savebar` | `pk-form-actions` |
| `tabs`, `tab` | `pk-tabs`, `pk-tab` |
| `tab-close` | `pk-tab` (its built-in close control) |
| `tabs--scroll` | `pk-tabs scroll` |
| `toolbar-lead` / `toolbar-note` | `pk-toolbar heading` / `note` |
| `toolbar-actions` | `pk-toolbar slot="actions"` |
| `topbar-back` | `pk-navbar` (its built-in back control) or `pk-breadcrumb` |
| `topbar-title`, `top-row`, `app-header-title` | `pk-navbar heading` |
| `app-header-search`, `app-search`, `app-search-input`, `app-search-toggle` | `pk-app-bar-search` |
| `workspace`, `workspace-main` | `pk-workspace` |
| `workspace-nav` | `pk-workspace slot="nav"` |
| `workspace-bar` | `pk-toolbar` |
| `workspace--fill` | `pk-workspace` |

The same table drives `js/compat-warn.js`'s `RETIRED_CLASSES` map, so the console warning always matches this guide.

This guide is about a *host app's* old markup, not about the SDK going forward, so it does not appear in the agent skills' workflows — an agent authoring new Plainkit markup never needs it; a person migrating an old app does.
