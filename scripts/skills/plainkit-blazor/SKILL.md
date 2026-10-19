---
name: plainkit-blazor
description: Build Blazor apps with PlainKit.Blazor, the Razor components (PkButton, PkInput, PkDialog, PkToast, PkField, PkTabs and more) over the Plainkit pk-* elements. Use it when a project references the PlainKit.Blazor package, uses Pk* components, AddPlainKit, PkOptions, IPkLog or the /_plainkit dev tools page, or the user wants Plainkit UI in Blazor: pages, forms, dialogs, toasts, dev tools, logging and ILogger forwarding. Look components, parameters, enums and events up in the references instead of guessing. Alpha: Blazor Server and standalone Blazor WebAssembly are verified. For plain HTML use the plainkit-sdk skill.
---

# PlainKit.Blazor

{{stamp}}

PlainKit.Blazor wraps the Plainkit elements as Razor components and serves the whole toolkit as static web assets (`_content/PlainKit.Blazor/plainkit/`), so nothing else is installed and nothing comes from a CDN. Targets .NET 10. A component is `Pk` plus the tag in PascalCase: `pk-alert` is `<PkAlert>`.

## Status (alpha)

- **Blazor Server and standalone Blazor WebAssembly are verified** (a live host each). In WebAssembly: register with `AddPlainKit` as usual, link `_content/PlainKit.Blazor/plainkit/plainkit.css` first in `wwwroot/index.html`, no `AddPlainKitDevTools` (no endpoints), `/_plainkit` needs `o.DevTools = true` outside Development, and the Files tool shows "No source to browse" (it reads a server folder). AOT and the Web App `InteractiveWebAssembly` mode were not run. **Components that do not exist yet:** {{missing}}. `PkTable<TItem>` (typed columns, cell templates, manual server mode) and `PkDataTable<TItem>` (searchable, sortable, server-paged list, no element of its own) are hand-written; see the "table" and "server-paged list" workflows. Any element can also be used as raw markup with `@onpk-...` handlers; see the "raw elements" workflow. **{{wrapperCount}} wrapper-only parameters do not exist** either (for example `PkDialog.CloseButtonLabel`, `PkDrawer.IsLoading`, `PkTooltip.OnClick`); the chart's `Data` and the image gallery's `Images` take the public records `PkChartData` and `PkGalleryImage`. `references/known-gaps.md` has the full list; do not use a parameter that is not in `references/components-*.md`.

## Rules

- Use only components and parameters listed in the references. Find a component in `references/components-index.md`, then open the file it names. Do not invent parameters. A JSON-valued parameter (`Config` of every page type; `Config`, `Values`, `Errors`, `State` of `PkPropertyGrid`; `Values` of `PkSettingsPage`) takes JSON text or a typed record, anonymous object or dictionary, serialised camel-case with nulls skipped, so write `Config="@_config"` with a record instead of a hand-written JSON string; `@bind-Values` still reports the raw JSON text (bind a `string`). An attribute that is not a parameter (`id`, `data-*`, `aria-*`, `class`, ...) is put on the element as it is, and a `class` is added to the component's own, so `<PkButton id="save" data-test="x" class="wide">` works. Inline `style` is blocked by the CSP: use a class or a CSS custom property set in a stylesheet, and no inline scripts either. Text is `PkText`, not a `<p>` or `<span>` with a class; real headings stay native `<h1>` to `<h6>`. Layout is `PkStack`, `PkCluster` and `PkGrid`, not a styled `<div>`; a max-width, padded content region is `PkContainer`. A prop with a fixed set of values is an enum (`ButtonVariant.Primary`; values in `references/enums.md`); a null enum leaves the default. Named slots are `RenderFragment` parameters; when you use one, write the body as an explicit `<ChildContent>` too. Two-way values are `@bind-Value`, `@bind-Checked`, `@bind-IsOpen`, `@bind-Open` (`PkCombobox`, `PkCommandPalette`, `PkMenuItem`, `PkSelectMenu`, `PkContextMenu`, `PkSplitButton`, `PkNavbar`, `PkLightbox`), `@bind-Value` on `PkTabs` (the chosen tab), `@bind-Expanded` and `@bind-Selected` on `PkTreeItem`, `@bind-Index` on `PkLightbox`, `@bind-Month` on `PkCalendar`, `@bind-Pressed` on a toggle `PkButton`, `@bind-Values` on `PkPropertyGrid` (JSON text, follows every change) and `PkSettingsPage` (JSON text, set after a successful `Save`), and `@bind-Selected` (`PkTable`); inside an `EditForm` the form controls (`PkInput`, `PkTextarea`, `PkSelect`, `PkCombobox`, `PkCheckbox`, `PkSwitch`, `PkRadioGroup`, `PkRange`, `PkRating`, `PkOtpInput`, `PkTagInput`, `PkColourInput`) take part like Blazor's own inputs: `@bind-Value` (or `@bind-Checked`) also gives the field to the `EditContext`, which marks it modified on a change and sets the element's `invalid` while the field has validation messages (add `<ValidationMessage For="() => _model.Name" />` for the text), the form controls also take `Description` (the help text, aria-description), `IsValid` and `Warning` (the valid and warning states; `PkInput`, `PkSelect`, `PkTextarea`), `Name`, `Required`, and on `PkInput` `MinLength`, `InputMode`, `Decimals`, `Locale` and `AutoHide`, and raise the native `OnInput` and `OnChange` (a `ChangeEventArgs` with the control's value) next to the model event behind `@bind-Value`, and a multi-select (`PkSelect` with `Multiple`) binds a typed list with `@bind-Values`; `PkDashboardPage` has no `Context` parameter (it is the page's own filter output; seed filters with `Config.values`); a form reset needs `Runtime.ReadFormValuesAsync(form.Element)` to pick up the new values (`references/setup-and-options.md`). Events are `EventCallback`/`EventCallback<PkXxxEventArgs>` (`references/events.md`); an event a component has no callback for still reaches `@onpk-...` on it. A callback cannot cancel an event: guard in your model or report the refusal through a parameter such as `CellErrors`. Reading uploaded files: `references/file-upload.md`.
- The components respond on their own at the SDK's named breakpoints ({{breakpoints}} px, desktop-first); write the literal query in your own CSS (`@media (max-width: 640px)`, also `--pk-bp-phone`/`--pk-bp-tablet`/`--pk-bp-wide`). Other widths need a rebuilt `dist` (the theme editor's Custom SDK tab, `<PkThemeEditor />`); its theme-only export, a small `plainkit-theme.css`, is the way to ship a theme today. A button that navigates is `<PkButton Href="/reports">` (a real anchor: `Target`, `Rel`, `Download`; `Disabled`/`Busy` drop the href). An icon-only button is `<PkButton Icon="true" IconName="plus">Add item</PkButton>` (`AriaLabel` overrides the accessible name; one with no name fails the scorecard).

## References (open on demand)

{{references}}

## Workflows

### Set up

```csharp
// Program.cs
using PlainKit.Blazor;
builder.Services.AddPlainKit();

app.MapRazorComponents<App>()
   .AddInteractiveServerRenderMode()
   .AddPlainKitDevTools();          // optional: only for the /_plainkit dev tools page
```

```razor
@* App.razor: in the head, FIRST, above the app's own stylesheets and HeadOutlet: the toolkit's base layer must be the bottom of the cascade *@
<PkStyles />
```

`PkStyles` writes a plain in-place `<link>` (`Minified`, `Versioned="false"`; `InHead="true"` is the old HeadContent behaviour, which lands after the app's stylesheets). With `app.MapStaticAssets()` (the ASP.NET Core 9+ default) the link is a fingerprinted, immutably-cached URL; without one it falls back to a `?v=` content hash, always revalidated. In a layout it lands in the body, after the head links. `CssVersioned`, `CssMin` and `Versioned(path)` on `PkAssets` are for a direct `<link>`. Add `@using PlainKit.Blazor`, `@using PlainKit.Blazor.Components`, `@using PlainKit.Blazor.Pages` and `@using PlainKit.Blazor.Shells` to `_Imports.razor` (base elements are in the root namespace, the tier components in the other three; Razor finds a tag only through an `@using`), and `using PlainKit.Blazor;` in `Program.cs`, so the `Pk*` components resolve, and an interactive render mode (`@rendermode InteractiveServer` or a global one) for `OnClick` and binding. Only for the `/_plainkit` dev tools page (together with `.AddPlainKitDevTools()` above; skip both otherwise), add the package assembly to the router in `Routes.razor`: `<Router AppAssembly="typeof(Program).Assembly" AdditionalAssemblies="new[] { typeof(PlainKit.Blazor.PkAssets).Assembly }">`. Options: `references/setup-and-options.md`. Next, open `references/components-index.md` to find a component and its parameters.

### Choose before you build

Before writing markup for a page or a job, open `references/choosing.md` (decision path, use-case table, anti-patterns): name the page type, find it in the table, open the template, layout or pattern (`plainkit-sdk` skill) or the component it names, and change only content, slots, parameters and tokens. A page derives from `PageBase` (title, breadcrumbs, busy, status) and writes only markup plus `override OnLoadAsync(CancellationToken)` (runs on first render and on a changed parameter; `IsLoading` is true before the first render, `LoadCancellation` is cancelled on the next load and on dispose, `InvokeStateChanged()` is safe after dispose, `OnDisposeAsync` replaces a hand-rolled `Dispose` and `CancellationTokenSource`; do not keep your own); a component that is not a page (a card, a panel) derives from `PkComponentBase` for the same `OnLoadAsync`, `IsLoading`, `LoadError`, `LoadCancellation`, `InvokeStateChanged` and `OnDisposeAsync`, plus `RunAsync(ct => ..., "label")` with counted `IsBusy`/`BusyLabel` for saves; a create-or-edit record page is `PkRecordForm` + `PkFieldGroup` + `PkRecordEditor`; a list is `PkTable` or `PkDataTable`; the frame is `PkAppShell`. An element with no component is raw markup with `@onpk-...` handlers. Write your own only when nothing fits, and say which gap it fills. For an app of several pages see the "Build an app" workflow.

### Add a page (a bound input and a list)

```razor
@page "/tasks"
@inject IPkLog PkLog

<PkStack>
    <PkPageHeader Title="Tasks" />
    <PkField Label="New task">
        <PkInput @bind-Value="_title" Placeholder="What needs doing?" />
    </PkField>
    <PkButton Variant="ButtonVariant.Primary" OnClick="Add">Add</PkButton>
    <PkListGroup Label="Tasks">
        @foreach (var task in _tasks) { <div>@task</div> }
    </PkListGroup>
</PkStack>

@code {
    private string? _title;
    private readonly List<string> _tasks = [];
    private async Task Add()
    {
        if (string.IsNullOrWhiteSpace(_title)) return;
        _tasks.Add(_title);
        await PkLog.WriteAsync(PkLogLevel.Info, "tasks", "task added", _title);
        _title = null;
    }
}
```

A toast after the add: `<PkToastStack>` plus a conditional `<PkToast OnDismiss="...">` (see "Turn on ILogger forwarding..." below for `IPkNotifications`, the simpler way to show one).

### Add a form
`PkForm` shows the browser's validation in each field and a summary; `OnValid` fires when a submit passes (`OnInvalid` when it is stopped).

```razor
<PkForm Summary OnValid="Save">
    <form @onsubmit:preventDefault>
        <PkField Label="Business name" Required>
            <PkInput @bind-Value="_name" Name="name" Required />
        </PkField>
        <PkFormActions Align="FormActionsAlign.End">
            <PkButton Type="ButtonType.Submit" Variant="ButtonVariant.Primary">Save</PkButton>
        </PkFormActions>
    </form>
</PkForm>

@code {
    private string? _name;

    private void Save() => Console.WriteLine($"Saved {_name}");
}
```

### Bind several values (tags, a multiple select)
`PkTagInput` and `PkSelect` with `Multiple` bind a typed list: `<PkTagInput @bind-Values="_tags" />` with `IReadOnlyList<string>? _tags`. A value with a comma is safe: `Values` goes to the element's `values` array and comes back as one, so nothing is joined or split in your code. Inside an `EditForm` `@bind-Values` also names the field (`ValuesExpression`): it is marked modified on change and shows its validation messages (`invalid`; a control that has `IsValid` shows `valid` once the field was changed and has none; `Warning` has no EditContext source, set it yourself). `Value` (the joined string) still works; bind one of the two. Parameters appear in the component's reference file as `Values`, `ValuesChanged`, `ValuesExpression`.

### Give a page a header with breadcrumbs
`PkPageHeader` draws the title and a `pk-breadcrumb` from a list of `PkCrumb(Label, Href)` (`<PkPageHeader Crumbs="@_crumbs" Title="@_name">`); the last crumb is the current page and is the title unless `Title` overrides it. `BackLink` and `Sticky`: `references/components-navigation.md`. A "..." menu of secondary actions in a card header is `PkCardMenu` (generated from `pk-card-menu`; put it in the card's `ActionsContent` with `PkMenuItem` children and handle `OnSelect`; `Label`, `IconName`, `Placement`, `@bind-Open`): `references/components-overlays.md`. A named slot for rich content is a `RenderFragment` parameter `<Slot>Content` (`PkAlert` `ActionContent` and `IconContent`, `PkDrawer` `HeaderContent`, `PkFormSection` `HeadingContent`, `PkPageShell` `TitleContent`, `PkDock` `EmptyContent` and `ToolbarStartContent`, `PkDataTable` `EmptyContent`, `BulkContent` and `ToolbarContent`; the plain `Title` string covers the usual case); the page factories' own `title` and `drawn` slots have none, nor do `PkDocPage`'s `nav`, `bar` and `aside` (the element builds them), and `PkDropzone` takes `<InputFile slot="input">` directly in `ChildContent`. `PkSplitter` `Collapsible`: `@bind-Collapsed` (`PersistKey` remembers it); `PkCodeView` `Header` `Language` `Copy` `Fill`, with `Actions` and `HeaderStart` fragments, `OnCopy`.

### Open a dialog from C#
`Size` (`PkDialogSize`: `Sm`, `Md`, `Lg`, `Xl`, `Fullscreen`) picks the width for a wide list or preview; left off, the element's default applies. `MaxWidthPx` sets an exact width.

```razor
<PkButton OnClick="@(() => _open = true)">Open</PkButton>
<PkDialog @bind-IsOpen="_open" Title="Discard changes?" Size="PkDialogSize.Lg">
    <ChildContent><p>This cannot be undone.</p></ChildContent>
    <FooterContent><PkButton OnClick="@(() => _open = false)">Close</PkButton></FooterContent>
</PkDialog>

@code {
    private bool _open;
}
```

### Show a table of typed rows (`PkTable`)
`PkTable<TItem>` takes typed columns and items. Write `TItem="Order"` on the component whenever a handler such as `OnRowClick` is a method group: Razor infers `TItem` from `Items` and `Columns` but not through `EventCallback<PkTableRowClickArgs<TItem>>`, so without it the build fails with CS1503 (the same for `PkDataTable`). A column's `Text` computes the cell text; its `Cell` template renders markup into the element's `cell-<id>-<key>` slot. Give it `IdOf` for stable row ids. With `Manual` you load, sort and filter yourself: the table shows `Items` as given and reports `OnSort` and `OnFilter`; put a `PkPagination` in `FooterContent`. Blazor renders the cell slots as ordinary children of the element and re-renders them with the `rows` attribute (no per-render JavaScript), so change rows by changing `Items`: the rows are serialised only when `Items` (its reference or count), `Columns` or `IdOf` change, so replace an item inside the same list with a new list, or call `Refresh()` on the table (`@ref`). `CurrentRow` marks the row whose record is open elsewhere (tinted, `aria-current`; set it from the route, the table never changes it); `RowHrefTemplate="/orders/{id}"` makes each first cell a real link that the app router follows, and to navigate yourself instead set `Navigate="host"` and handle `OnNavigate` (a notification: `args.To` is the address, call `NavigationManager.NavigateTo`; a .NET callback cannot cancel the event, which is why the choice is made up front, and `Navigate="none"` lets the browser follow the link; the same on `PkDataTable`); the routed list and detail page with a `PkWorkspace` is the `routed-list-detail` template in the `plainkit-sdk` skill. An item property `Tone` (`warning`, `positive`, `accent`, `critical`) or `Indent` (1 or 2) marks that row: tint and leading rule, in the phone cards too. For a routed list-to-record pair set `RowHrefTemplate="/orders/{id}"` on `PkListPage<TItem>`: the first cell of each row becomes a real link (new tab, middle click, copy address) and a plain click goes through the app router without a reload; `OnRowClick` stays for an imperative handler. `PkTable<TItem>` and `PkDataTable<TItem>` take the same `RowHrefTemplate`.

```razor
<PkTable TItem="Order" Items="_orders" Columns="_columns" IdOf="o => o.Number.ToString()" Label="Orders" Manual Clickable
         @bind-Sort="_sort" @bind-SortDirection="_dir" OnSort="Reload" OnRowClick="Open" />

@code {
    private readonly IReadOnlyList<PkTableColumn<Order>> _columns =
    [
        new() { Key = "customer", Label = "Customer", Sortable = true },
        new() { Key = "total", Label = "Total", Type = PkTableColumnType.Number, Text = o => o.Total.ToString("C") },
        new() { Key = "status", Label = "Status", HidePhone = true, Cell = o => @<PkBadge>@o.Status</PkBadge> },
    ];

    private void Reload(PkSortEventArgs e) { /* load the rows in _sort/_dir order into _orders */ }
    private void Open(PkTableRowClickArgs<Order> row) => Console.WriteLine(row.Item.Number);
}
```
Hand-written markup instead of `Columns` and `Items` (a static header and a `@foreach` body): set `ChildContent` (with `HeadContent`, `FootContent`) on `PkTable TItem="object"`; `references/table-raw-mode.md`. A data-driven `PkTable` also takes `FootContent` for a totals or summary row (one cell spanning every column; a trailing card on a phone).

### Select all rows of a paged `PkTable`
 To edit cells in place set `Editable`, give a column an `Editor` (`PkTableEditor`: `Text`, `Number`, `Select`, `Date`, `Textarea`, `Combobox`; `Options`, `Free`, `Required`, `Min`, `Max`, `MaxLength` as the element) and update your item in `OnCellEdit`; `Min` and `Max` take a number or, for a date, a `DateOnly` or an ISO string.
For a `PkTable` with `Manual` rows, set `SelectAllTotal` to the number of rows that match your query (all pages). `Selected` then keeps its ids when you replace `Items` for paging, search or sort. When every loaded row is selected the table offers "Select all N rows"; choosing it sets `SelectScope` to `"all"` (it follows the table, and goes back to `"page"` when the selection changes) and raises `OnSelectAll` with `Scope` (`page` or `all`) and `Count`. The ids of the other pages are not sent: on `all`, run your action from the query you already hold.

### Show a searchable, server-paged table (`PkDataTable`)

`PkDataTable<TItem>` is a thin wrapper over the `pk-data-table` element, which owns search, sort, page, page size, the loading, empty and error states and the selection; the component calls your `Load` for one page at a time (a new search/sort/page size goes back to page 1, a request the element aborts (superseded, or the element left the page) has its `CancellationToken` cancelled on the server, `ReloadAsync()` reloads). A `multiselect` filter (several chosen options) arrives in `request.MultiFilters[key]` as a list of strings, a single-value filter in `request.Filters[key]`. `SortKey`, `Descending`, `Search` and `PageSize` bind two-way (`@bind-SortKey` and so on, from the element's `pk-query-change`), so the query survives a reload or goes into the URL. A column's `Cell` template renders into the element's `cell-<id>-<key>` slot; `OnRowClick` makes the rows keyboard stops. Every parameter, paging a selection past SignalR's message-size limit, and the routed list-and-record-page recipe (`PkRecordForm`, `references/record-form.md`, `references/record-editor.md`): `references/data-table.md`. `PkRecordForm` shows sections by tab with no page CSS: put a `PkTabs` in `Tabs`, wrap each section (in the form or `Sidebar`) in an element with `tab="key"` (space-separated for several) and set `TabsFrom` (`phone` default, `tablet`, `always`). `PkDetailLayout` does the same for `data-pk-section` cards (`TabsFrom`, `SectionsAbove`, `TabParam`); with `HideTabs` it draws no strip: set `Section` from the `OnTabChange` of a `PkPageHeader` whose `TabItems` draw the strip. `PkRecordPage<TItem>` (typed record page, the only one): `Fields` (`PkFieldSpec<TItem>`, as on `PkFieldGroup`), `Load` (returns the `TItem`), `Save` (receives it), `ViewFields` (view-mode value templates by field key) and the `MainBefore`, `MainAfter` and `SideAfter` slots for `PkCard` sections around the field list or form and after the sidebar cards. `PkEmptyState`: `Title`/`Description` are props, `ChildContent` is a rich description (inline text, in a paragraph), and the next step (a link back, a primary button) goes in `ActionContent`, which renders under the description; a link in `ChildContent` is description text, not an action. **Testing** (Testing pages that use PkDataTable): under bUnit nothing calls `Load`, so `using PlainKit.Blazor.Testing;` and `var items = await cut.Instance.LoadAsync();` (optionally a `PkListRequest`) runs it the way the element does and renders the rows and `Cell` output (`cut.Find("[slot=cell-2-Name]")`), and `await cut.Instance.ClickRowAsync("2");` raises the row click for `OnRowClick`, `await cut.Instance.AddAsync();` raises the add action for `OnAdd` (with an `AddLabel`); `PkFieldGroup<T>` has `Fields()`, `Field(key)` (flags and value) and `await CommitAsync(key, value)`, with several groups or a private item type use `Services.FieldStates()`, `Services.FieldState(key)` (null when none shows it) and `await Services.CommitFieldAsync(key, value)` on the context service provider (bUnit Services); `PkPageHeader` has `CrumbTrail()`; `PkListPage<T>` has `LoadAsync()`, `ClickRowAsync(id)` and `Sent()`, `PkRecordPage<T>` has `LoadAsync(id)`, `Fields()`, `SetField`, `SaveAsync()`, `Cancel()`, `DeleteAsync()`, `ActionAsync(key)`, `Title()`, `Sidebar()` and `Sent()`; never reflect over internal types.

To select rows set `Selectable` and bind `@bind-Selected` (ids); the selection survives paging and search. "Select all N rows" is the **query**, not a list of ids: `OnSelect` raises `Scope == "all"` and the query (`args.ToRequest()` gives the search and sort), and you run the bulk action against it on the server. `LoadAllIds` is gone. For a form field that picks one record (or, with `Multiple`, several) from a long list use `PkLookupPicker<TItem>` instead of a `PkCombobox` with thousands of options: same `Load`, `Columns` and `IdOf`, plus `@bind-Value` or `@bind-Values` (`ValueExpression`/`ValuesExpression` inside an `EditForm`), `LabelOf`, `Max`, `SelectedLabels`, `Description`, `SearchDebounce` (milliseconds the popup search waits), the native `OnInput`/`OnChange` (`ChangeEventArgs`) and a `Resolve` callback that names stored keys; `Filters` (`PkFilterField` list, also on `PkDataTable`) puts filter fields beside the search, their values reaching `Load` in `request.Filters` and `request.MultiFilters`; the popup is built on the first open. The config-driven page types work from C# the same way: `PkListPage<TItem>` takes `Load` (and `OnRowClick`, whose `PkRowClickEventArgs` carries the row key in `Id` and the row as a `JsonElement`; setting it makes rows clickable; `RowHrefTemplate="/orders/{id}"` instead makes the first cell of each row a real link to the record page), and `PkRecordPage<TItem>` takes `Load` (`Func<string, Task<TItem?>>`, called with `Config`'s `id`; null shows "not found") and `Save` (`Func<TItem, Task>`: the loaded item with the form's values applied through each field's `Set`; throwing keeps the edits and shows the message). The fields are typed `Fields` (`PkFieldSpec<TItem>`: `Key`, `Label`, `Kind`, `Get`, `Set`, `Hint`, `Required`, `Options`...), and `Config` is only the page options (`id`, `heading`, `title`, `sidebar`...); a new record (no `id`) starts from `Model` and Save receives it. `When`, `Disabled`, `ReadOnly`, `LabelWhen` and `HelpWhen` are read from the record once it is loaded; a spec's `Editor` template is the body of that field in edit mode (it edits the item itself, so bind its controls to the item's properties) and `MainBefore`/`MainAfter` stay around the form in edit mode; these members are .NET functions of the item, evaluated when the record loads (and after a save), not as the user types (for a condition that follows the user's edits set the string members `WhenExpr`, `DisabledExpr`, `ReadonlyExpr`, `RequiredExpr`, e.g. `WhenExpr = "status == 'paid' && amount > 100"`: the element evaluates them against the live values, with field keys, quoted text and numbers, `== != < <= > >=`, `in [a, b]`, `!`, `&&`, `||` and no function calls); The untyped JSON `fields` and the `Func<. For a label or help that must follow the user's edits set `LabelWhenExpr` or `HelpWhenExpr` (conditional text such as `"status == 'paid' ? 'Paid on' : 'Due on'"`; the first true condition's text, a field key giving that field's value, an empty answer keeps `Label` or `Help`)..., IReadOnlyDictionary<string, JsonElement>>` Save are gone (migrate: put each `{ name, label, type }` into a `PkFieldSpec<TItem>` and save from the item). Other page fields: `PkListPage` columns are JSON `Config` or typed `Columns` (`PkTableColumn<TItem>`, replaces the config columns; a column's `Cell` template fills that cell of every loaded row, with `IdOf`; its `Header` fragment puts a help tooltip or action beside the header title, outside the sort button), `Cells` (column key to a `RenderFragment<TItem>`) is the same for JSON columns, and `PkRecordPage` view-mode values are `ViewFields`. `PkRecordPage Sticky` pins its title bar, with Edit, Cancel, Save and Delete in it, while a long form scrolls. `PkRecordPage BeforeSave` (`Func<TItem, Task<bool>>`) runs after validation and before `Save`: return false to stop and stay in edit mode (a confirm of your own). `PkRecordPage` `Sections` and `Sidebar` are `PkRecordSection(Heading, Fields, Columns)`: `Columns: 3` puts a card's short fields side by side in edit mode. `PkRecordPage` also takes `IsUserFacing` (`Func<Exception, bool>`, as on `PkRecordEditor`: a `Load` or `Save` exception it accepts shows its message besides one that implements `IPkUserFacingException`; any other is generic), `OnDelete` (shows Delete of an existing record, in view and edit mode; the record id arrives in `PkRecordDeleteEventArgs`), `Busy` and `Error`: on a `PageBase` page bind `Busy="IsBusy"` and `Error="StatusMessage"` and run the handler in `await TryBusyAsync(...)` (a failure sets the status through `DescribeError`, the page shows it above the record, and every button waits while busy). The routed pair with these two pages is the guide "A routed list and record page in Blazor". `PkWizardPage` takes `Validate` (`Func<string, IReadOnlyDictionary<string, JsonElement>, Task<object?>>`: the step id and that step's values; return null to go on or an object with `errors` to mark fields), `Load` (draft answers by field name, set after the first draw so the wizard starts again from step one) and `Submit`. Panes are slots, not callbacks (a pane lives in the element's shadow tree, which Blazor cannot render into): a wizard step without `fields` is your own `<div slot="step-<id>">` child of `PkWizardPage` (its controls are yours, not collected into the answers); `PkWorkspacePage` takes `NavContent`, `ChildContent` (main) and `AsideContent`; `PkMasterDetailPage` takes `DetailContent` (read `RecordId`; shown only while one is set), `Load` (query as JSON in, `{ rows, total }` out) and `Close` (Back pressed: navigate to the list; `open(row)` returns an href synchronously and is not mapped).

```razor
<PkDataTable TItem="Customer" @ref="_list" Load="LoadAsync" Columns="_columns" IdOf="c => c.Id.ToString()" Label="Customers"
             SearchPlaceholder="Search customers" AddLabel="+ Add customer" OnAdd="Add" OnRowClick="Open" CurrentRow="@_openId" />

@code {
    private async Task<PkListResult<Customer>> LoadAsync(PkListRequest request)
    {
        var query = _db.Customers.Where(c => request.Search == null || c.Name.Contains(request.Search)).OrderBy(c => c.Name);
        var items = await query.Skip(request.Skip).Take(request.PageSize).ToListAsync(request.CancellationToken);
        return new PkListResult<Customer>(items, await query.CountAsync(request.CancellationToken));
    }
    // Columns are PkTableColumn<Customer> records (see references/data-table.md); Open and Add are your handlers.
}
```

### Use an element that has no component (raw elements)
Raw `pk-*` markup works in Razor with the SDK's props as attributes (`references/` of the `plainkit-sdk` skill), and so do its events: every `pk-*` event is registered with Blazor and mapped to a `Pk...EventArgs` class, so `@onpk-sort="OnSort"` with `void OnSort(PkSortEventArgs e)` just works (no JavaScript listener, no `ElementReference`; `references/events.md` lists the args). The elements load once a `Pk*` component has rendered on the page (any one: the runtime initialises on the first render); on a page with only raw tags, initialise it yourself:

```razor
@inject PkRuntime Runtime

<pk-card heading="Orders">
    <pk-table label="Orders" columns="@Columns" rows="@Rows"></pk-table>
</pk-card>

@code {
    private const string Columns = "[{\"key\":\"name\",\"label\":\"Name\"},{\"key\":\"status\",\"label\":\"Status\"}]";
    private const string Rows = "[{\"id\":1,\"name\":\"Widget\",\"status\":\"Active\"},{\"id\":2,\"name\":\"Gadget\",\"status\":\"Draft\"}]";

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (firstRender) await Runtime.EnsureInitializedAsync();
    }
}
```

### Turn on ILogger forwarding and the SDK log

```csharp
builder.Services.AddPlainKit(o =>
{
    o.Logging.Level = PkLogLevel.Info;                      // the SDK's global level
    o.Logging.ForwardToILogger = true;                      // SDK entries also go to ILogger (off by default)
    o.Logging.ForwardMinimumLevel = PkLogLevel.Warn;        // the forwarder's own filter
    o.Logging.ForwardScopes.Add("pk-*");                    // empty means every scope
    o.Logging.Routes[PkLogLevel.Error] = ["console", "toast"];
});
```

Forwarded entries use the fixed category `PlainKit.Browser`. Inject `IPkLog` to write your own entries into the browser-side SDK log; show both with `<PkLogs />`. Details: `references/logging.md`. **Toasts and modal dialogs**: inject `IPkNotifications` and `IPkDialogs`. **Per-viewer state**: inject `IPkTheme`, `IPkSettings` or `IPkStore` (from `OnAfterRenderAsync(firstRender)` only). Both, with examples and members: `references/setup-and-options.md`.

### More workflows
- **Build an app (frame, modules, guard, shared state).** `AddPlainKitApp(app => app.Brand(..).Module<T>()..Home(id))` registers the module allow-list. A module is an `IPkModule` whose `Manifest` is PkModuleManifest (its FromJson reader) of the shared JSON (`core/js/app/manifest.schema.json`); its pages are `@page` components whose routes the manifest must agree with. Wrap the router: `<PkApp><PkModuleBoundary><PkRouteGuard><Router>`; `PkApp` draws brand, module picker, side nav, search, breadcrumb, footer and theme toggle. `IPkModuleGuard.CanAsync(PkModuleContext)` false shows not-allowed (a UX guard only; authorization stays `[Authorize]` and API checks); a page exception shows Try again, the frame stays. `IPkStore`, `IPkSettings` and `IPkTheme` (`Changed`) share the SDK's `pk.<module>` envelope and theme; no cross-tab sync; storage is in-memory before the first render. Dashboard from modules: add `contributes` (key, for, tab, label, kind, size, order, needs) to the module's manifest JSON, implement `IPkWidgets.LoadWidget(key)` on the module (return data for a stat or chart, never markup) and render `<PkModuleDashboard Surface="overview" Tabs="@tabs" />`; the page owns the tab labels. Lazy modules (WebAssembly): the module class implements `IPkLazyModule` (`Assemblies`: the `BlazorWebAssemblyLazyLoad` names), the host registers `PkLazyModuleLoader(catalog, names => LazyAssemblyLoader.LoadAssembliesAsync(names))` also as `IPkModuleLoader`, and the router gets `AdditionalAssemblies="Loader.Assemblies" OnNavigateAsync="c => Loader.LoadForPathAsync(c.Path, c.CancellationToken)"`; a failed download shows the boundary. Copy `blazor/samples/PlainKit.AppSample` (Server) or `PlainKit.AppSample.Wasm` (lazy module).
- **Wire the dev tools.** In Development, `/_plainkit` serves Gallery, Files, Scorecard, Performance, Console and Logs (elsewhere set `o.DevTools = true`); a single tool also works on your own page (`<PkLogs Height="26rem" />`, `<PkGallery Kind="PkGalleryKind.Elements" />`): `references/devtools.md`.
- **Share a context menu across targets.** Several rows or cards with the same always-visible icon buttons competing for space: wrap the region in one `<PkContextMenu>` instead of a button row. `OnOpen`'s `Context` field names what was targeted, so the handler rebuilds `<MenuContent>` per target before it paints: `references/components-overlays.md`.

### Upgrade this app to a newer PlainKit.Blazor
`references/upgrading.md`: a blast-radius recipe, not a changelog summary. Also check the app against `references/choosing.md`: a hand-written wrapper, table or record page that a newer component now covers is worth replacing. Find the installed and target versions, read `CHANGELOG.md` between them (Breaking/Removed/Changed first), grep this app for what those entries name, turn the matches into a severity-ordered checklist. Mechanical renames get done; a judgment call gets flagged. Format text and numbers for `pk-input type="date"`/`type="number"` with `PkInputFormat` (`references/input-format.md`) rather than hand-rolling the invariant-culture parse.

### Check your work

{{conformanceChecklist}}
