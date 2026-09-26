---
title: Choosing what to build with
order: 3
summary: Before you write a page, look for a template, a layout, a pattern or an element that already does the job. A decision path, a table from page type to starting point, the rules for customising a template and the anti-patterns that cost real apps the most.
---

Plainkit ships more than elements. It ships page templates, page layouts, composed patterns and, in Blazor, components for whole record pages. Most of the time an app that struggles with Plainkit is not missing a feature: it is hand-building something that already exists (a table, a modal, a header search, a record form) and then fighting the SDK's own CSS to make it fit. This guide is about choosing, before you write markup. The rule of thumb: the more of the page you take from the SDK, the less you maintain.

## The decision path

Go down this list and stop at the first step that fits.

1. **A template fits the page type.** A template is a full page (list and detail, dashboard, settings form, wizard, sign in, workspace). Paste it, then change the content. The catalogue is in the agent skill's [templates reference](../../dist/skills/plainkit-sdk/references/templates.md) and on the gallery's Templates page.
2. **A layout fits the page's anatomy.** A layout is the skeleton of a kind of page (list, record, record with sidebar, setup, tool, wizard) with placeholder content. Take it when no template matches but the page is one of those kinds ([layouts reference](../../dist/skills/plainkit-sdk/references/layouts.md)).
3. **Compose patterns.** A pattern is a small composition for one job (confirm before delete, filter bar and table, forms, notifications, onboarding, search results, settings with unsaved changes). Put one or two inside your own page ([patterns reference](../../dist/skills/plainkit-sdk/references/patterns.md)).
4. **Use the element that names the job.** A table is `pk-table`, a modal is `pk-dialog`, tabs are `pk-tabs`, a header search is `pk-app-bar-search`. Look the job up in the [elements index](../../dist/skills/plainkit-sdk/references/elements-index.md) before writing a `<div>`.
5. **Extend, never override.** Change what an element or template shows through its slots, its props, its `::part()` names, its `--pk-*` custom properties and the tokens. Do not reach into its shadow tree, copy its markup or fight its CSS.
6. **Write your own only for what the SDK does not cover.** Then keep it small, build it from `pk-stack`, `pk-cluster`, `pk-grid` and `pk-text`, use tokens for every colour and size, and record the gap (see "Ask for a missing component").

## Use cases: where to start

Only things that exist today are listed. A dash means there is no ready-made piece: compose from the elements named.

| Page type or job | Start from | In Blazor |
|---|---|---|
| Whole app frame: side nav, header, body | Template `overlays-nav` for the composition; element `pk-app-shell` with `pk-side-nav` or `pk-navbar` | `PkAppShell`, `PkSideNav` |
| A plain content page: breadcrumbs, title, actions, content, footer | Template `page`; element `pk-page-header` | `PkPageHeader`, or `PageBase` for its state |
| List page (search, table, rows open a record) | Layout `list`; template `crud`; element `pk-table` | `PkTable`, or `PkDataList` when the server pages, searches and sorts |
| List and detail on one page | Template `crud`; template `master-detail`; template `routed-list-detail` (the route drives it) | `PkTable` beside a `PkCard`; routes and `NavigationManager` for the record |
| Record create and edit | Layout `record`; layout `record-detail` (main body plus sticky sidebar); element `pk-detail-layout` | `PkRecordForm` with `PkFieldGroup` and `PkRecordEditor` |
| Read-only record or key figures | Layout `record-detail`; elements `pk-field-list`, `pk-stat` | `PkFieldList`, `PkStat` |
| Settings form | Template `form`; pattern `unsaved-settings` for a sticky save bar; elements `pk-form`, `pk-form-section` | `PkForm` with `PkFormSection` |
| Long form built from a list of fields | Pattern `forms` for the controls | `PkFieldGroup` with `PkFieldSpec` |
| Dashboard or report | Template `dashboard`; pattern `data-display`; elements `pk-stat`, `pk-chart` | `PkStat`, `PkChart` |
| Search | Pattern `search-results`; element `pk-app-bar-search` in the shell header; `pk-command-palette` for a keyboard launcher | `PkAppBarSearch`, `PkCommandPalette` |
| Filtered table | Pattern `filter-table`; element `pk-table-filters` | `PkTableFilters`, `PkDataList` |
| Wizard or guided flow | Template `wizard`; layout `wizard`; elements `pk-stepper`, `pk-step` | `PkStepper` |
| Master and detail with tabs | Template `master-detail`; pattern `master-detail-pattern` | `PkListGroup` beside `PkTabs` |
| Tool page (one input, one outcome) | Layout `tool`; template `workspace` for a multi-pane tool | `PkWorkspace` |
| Sign in | Template `auth` | `PkCard` with `PkField` and `PkInput` |
| Empty, error and loading regions | Template `states`; elements `pk-empty-state`, `pk-skeleton`, `pk-spinner`, `pk-alert` | `PkEmptyState`, `PkSkeleton` |
| Confirm a destructive action | Pattern `confirm-delete`; element `pk-dialog` | `PkDialog` |
| Toasts and notices | Pattern `notifications`; elements `pk-toast-stack`, `pk-alert` | `PkToastStack` |
| Onboarding checklist | Pattern `onboarding` | `PkStepper`, `PkProgress` |
| Short list of small records with an add form | Layout `setup` | `PkTable` with `PkField` |
| Marketing or landing page | None: compose from `pk-stack`, `pk-grid`, `pk-card`, `pk-text` and `pk-button`, and see "Ask for a missing component" | same |

## Customize a template

A template is a starting point you own once you paste it. Change these freely:

- **Content**: text, data, the rows and columns, which fields exist, the labels.
- **Which elements are present**: delete a card, add a `pk-tab`, swap one `pk-stat` for another.
- **Slots and props**: put your own button in `slot="actions"`, set `heading`, `variant` or `size`, all of which the element's reference lists.
- **The page script**: keep the script the template shows and edit its data and handlers. The demo shell around a template (`mountChrome`) is not part of it.
- **Tokens**: recolour or resize by overriding a token in your own stylesheet ([Theming and tokens](theming.md)).

Do not change these:

- **Do not copy an element's internals into the page.** If the markup you want is what the element's shadow tree already draws, use the element.
- **Do not add a wrapper element to fix spacing.** Use `pk-stack`, `pk-cluster` or `pk-grid` with a `gap`, or a token.
- **Do not override an element's CSS from outside** (a selector aimed at its internals, an `!important`). If a `--pk-*` custom property or a `::part()` does not exist for what you need, that is a gap to file, not a reason to override.
- **Do not turn the page's structure inside out.** The elements respond to width by themselves ([Responsive design](responsive-design.md)); a template that already collapses on a phone keeps doing so only while you keep its structure.

A template extended through its extension points looks like this:

```html
<pk-page-header heading="Orders" level="1">
  <pk-button slot="actions" variant="primary">New order</pk-button>
</pk-page-header>
```

and recoloured through a token, never a literal colour:

```css
:root[data-theme="dark"] {
    --color-accent: #7c3aed;
}
```

## Anti-patterns

| Instead of | Use | Why |
|---|---|---|
| Your own table markup with sort, select and paging | `pk-table` (Blazor: `PkTable` or `PkDataList`) | Keyboard, sorting, selection, row menus, an empty state and the phone layout are already done and tested |
| A `<div>` overlay with your own focus handling for a modal | `pk-dialog`, opened with `data-open` or `PkDialog.confirm` | Focus trap, Escape, backdrop and scroll lock come with it |
| Tabs from buttons and `hidden` panels | `pk-tabs` with `pk-tab` and `pk-tab-panel` | Arrow keys, roles and the phone strip |
| A hand-written `PkField` plus `PkInput` wrapper component per field | `PkFieldGroup` with a list of `PkFieldSpec` | One place for label, hint, help, validation, options, conditional fields and read-only state |
| A header search box built from an `<input>` | `pk-app-bar-search` in the `pk-app-shell` header | It collapses to an icon on a phone, shows grouped results and coordinates with the shell |
| A repeated create-or-edit page (toolbar, error, save state) copied per record | `PkRecordForm` with `PkRecordEditor` | Load, validate, save, delete, busy and error are one implementation |
| Copying the same title, error and busy bookkeeping into every page | `PageBase` (Blazor) or `createPage` (SDK) | Status, busy overlay, breadcrumbs and logging as configuration |
| A `display: contents` wrapper or a wrapper `<div>` between a shell, nav or dropdown and its slotted children | Put the slotted content directly in the slot; use the component's own parameters | A wrapper breaks the parent's direct-child lookups and `::slotted` rules |
| `!important` or a selector into an element's internals | A slot, a prop, a `::part()`, a `--pk-*` property or a token | An override breaks at the next release and is invisible to the scorecard |
| A literal colour, pixel size or duration | A token (`--color-*`, `--space-*`, `--text-*`, `--radius-*`, `--duration-*`) | Themes, density and dark mode only reach tokens |
| The removed `u-*` utility classes and the retired class-based components | `pk-text`, `pk-stack`, `pk-cluster`, `pk-grid` and the elements ([Migrating from the compat classes](migrating-from-compat.md)) | Removed classes fail silently: the styling just disappears |
| A `<p>` or `<span>` with a class for text | `pk-text` | Tone, variant and font are props, not classes |
| Your own toast, tooltip or dropdown | `pk-toast-stack`, `pk-tooltip`, `pk-dropdown` | Position, focus and dismissal are done |

## When you must write your own

Write your own only when the SDK has nothing for the job and composing existing elements cannot do it. Then:

- Compose from `pk-stack`, `pk-cluster`, `pk-grid`, `pk-text` and `pk-card`; do not invent a `pk-*` tag.
- Style with tokens in a stylesheet (no inline `style`, no `<style>` element), so it works under the strict content security policy.
- Keep it in one place, named for the job, so it can be replaced when the SDK adds the element.
- Record the gap (next section).

## In Blazor

- **Every page starts as a `PageBase`** when it needs a title, breadcrumbs, a status notice or a busy overlay: derive from it instead of repeating that state.
- **A record page is three pieces**: `PkRecordForm` draws it (toolbar, tabs, error, cards, sidebar), `PkFieldGroup` renders the fields from `PkFieldSpec` items, `PkRecordEditor` holds the load, validate, save and delete state.
- **A list is `PkTable`** for rows you already have, and **`PkDataList`** when the list is searched, sorted and paged on the server.
- **The frame is `PkAppShell`**, with `PkSideNav` (it follows the route by itself) and `PkAppBarSearch` in the header.
- **An element with no component** is used as raw markup with `@onpk-...` handlers, not re-wrapped by hand.

```razor
<PkRecordForm OnValid="SaveAsync" Busy="_busy" Error="@_error">
    <PkCard Heading="Details">
        <PkFieldGroup TItem="Location" Fields="_fields" Model="_location" />
    </PkCard>
</PkRecordForm>

@code {
    private Location _location = new();
    private bool _busy;
    private string? _error;
    private IReadOnlyList<PkFieldSpec<Location>> _fields =
    [
        new() { Key = "name", Label = "Name", Required = true, Get = l => l.Name, Set = (l, v) => l.Name = v ?? "" },
    ];
    private Task SaveAsync() => Task.CompletedTask;
}
```

## Ask for a missing component

If the decision path ends at "write your own", the SDK has a gap, and the gap is worth recording so the next app does not rebuild it.

1. Search the open issues in the repository for the job first (a component may be planned).
2. If there is none, add it to the standing issue "Tracker: components the SDK lacks" (search the repository's issues for that title) or open an issue that describes the job, the page it appears on, what you composed from existing elements in the meantime and what was awkward about it.
3. Build the interim version from existing elements only, in one place, named for the job.
4. Do not fix the gap by patching the SDK's own CSS in your app.
