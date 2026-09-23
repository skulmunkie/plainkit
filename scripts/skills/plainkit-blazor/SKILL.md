---
name: plainkit-blazor
description: Build Blazor apps with PlainKit.Blazor, the Razor components (PkButton, PkInput, PkDialog, PkToast, PkField, PkTabs and more) over the Plainkit pk-* elements. Use it when a project references the PlainKit.Blazor package, uses Pk* components, AddPlainKit, PkOptions, IPkLog or the /_plainkit dev tools page, or the user wants Plainkit UI in Blazor: pages, forms, dialogs, toasts, dev tools, logging and ILogger forwarding. Look components, parameters, enums and events up in the references instead of guessing. Alpha: Blazor Server and standalone Blazor WebAssembly are verified. For plain HTML use the plainkit-sdk skill.
---

# PlainKit.Blazor

{{stamp}}

PlainKit.Blazor wraps the Plainkit elements as Razor components and serves the whole toolkit as static web assets (`_content/PlainKit.Blazor/plainkit/`), so nothing else is installed and nothing comes from a CDN. Targets .NET 10. A component is `Pk` plus the tag in PascalCase: `pk-alert` is `<PkAlert>`.

## Status (alpha)

- **Blazor Server and standalone Blazor WebAssembly are verified** (a live host each). In WebAssembly: register with `AddPlainKit` as usual, link `_content/PlainKit.Blazor/plainkit/plainkit.css` first in `wwwroot/index.html`, no `AddPlainKitDevTools` (no endpoints), `/_plainkit` needs `o.DevTools = true` outside Development, and the Files tool shows "No source to browse" (it reads a server folder). AOT and the Web App `InteractiveWebAssembly` mode were not run.
- **Components that do not exist yet:** {{missing}}. `PkTable<TItem>` (typed columns, cell templates, manual server mode) and `PkDataList<TItem>` (searchable, sortable, server-paged list, no element of its own) are hand-written; see the "table" and "server-paged list" workflows. Any element can also be used as raw markup with `@onpk-...` handlers; see the "raw elements" workflow.
- **{{wrapperCount}} wrapper-only parameters do not exist** (for example `PkDialog.CloseButtonLabel`, `PkDrawer.IsLoading`, `PkTooltip.OnClick`). The chart's `Data` and the image gallery's `Images` take the public records `PkChartData` and `PkGalleryImage`. `references/known-gaps.md` has the full list; do not use a parameter that is not in `references/components-*.md`.

## Rules

- Use only components and parameters listed in the references. Find a component in `references/components-index.md`, then open the file it names. Do not invent parameters.
- An attribute that is not a parameter (`id`, `data-*`, `aria-*`, `class`, ...) is put on the element as it is, and a `class` is added to the component's own, so `<PkButton id="save" data-test="x" class="wide">` works. Inline `style` is blocked by the CSP: use a class or a CSS custom property set in a stylesheet.
- A prop with a fixed set of values is an enum (`ButtonVariant.Primary`); a null enum leaves the element's default. Values are in `references/enums.md`.
- Two-way values are `@bind-Value`, `@bind-Checked`, `@bind-IsOpen`, and `@bind-Open` on `PkCombobox`, `PkCommandPalette` and `PkMenuItem` (its submenu), and `@bind-Selected` on `PkTable`. A form reset raises no change event, so a value you mirror is stale afterwards: in the form's `OnReset` callback call `await Runtime.ReadFormValuesAsync(form.Element)` (inject `PkRuntime`, keep the `PkForm` with `@ref`, name the controls) and copy the values back. Events are `EventCallback` or `EventCallback<PkXxxEventArgs>` (`references/events.md`). To read uploaded files put `<InputFile slot="input" OnChange="..." />` inside `PkDropzone` (in `<ChildContent>` when `HintContent` is used); drops and the picker both reach that `OnChange`, and `OnFiles` only counts (`references/file-upload.md`).
- Named slots are `RenderFragment` parameters (`FooterContent`). When you use one, write the body as an explicit `<ChildContent>` too.
- No inline styles or scripts: the toolkit is built for a strict CSP. The components respond on their own at the SDK's named breakpoints ({{breakpoints}} px, desktop-first: a rule applies at that width and below). In your own CSS write the literal query with the same width (`@media (max-width: 640px)`); the widths are also `--pk-bp-phone`, `--pk-bp-tablet` and `--pk-bp-wide` on `:root`. Other widths need a rebuilt `dist`, which the theme editor's Custom SDK tab exports (`<PkThemeEditor />` shows it). For colours and styles only, use its theme-only export: a small `plainkit-theme.css` to put in `wwwroot` and link after `<PkStyles />` (no breakpoint or SDK file changes). Exporting from Blazor code and using a custom `dist` as the app's assets are not built yet.
- A button that navigates is `<PkButton Href="/reports">`: a real anchor (middle and ctrl-click and enhanced navigation work; `Target`, `Rel`, `Download`; `Disabled` and `Busy` drop the href; `OnClick` still fires, `@onclick:preventDefault` replaces the navigation). An icon-only button is `<PkButton Icon="true" IconName="plus">Add item</PkButton>`: with `Icon` the text is hidden visually and stays the name (and the hover tooltip); `AriaLabel` overrides it; one with no name fails the scorecard.

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

`PkStyles` writes a plain in-place `<link>` (`Minified`, `Versioned="false"`; `InHead="true"` is the old HeadContent behaviour, which lands after the app's stylesheets). With `app.MapStaticAssets()` (the ASP.NET Core 9+ default) the link is a fingerprinted, immutably-cached URL; without one it falls back to a `?v=` content hash, always revalidated. In a layout it lands in the body, after the head links. `CssVersioned`, `CssMin` and `Versioned(path)` on `PkAssets` are for a direct `<link>`. Add `@using PlainKit.Blazor` (and `using PlainKit.Blazor;` in `Program.cs`) so the `Pk*` components resolve, and an interactive render mode (`@rendermode InteractiveServer` or a global one) for `OnClick` and binding. Only for the `/_plainkit` dev tools page (together with `.AddPlainKitDevTools()` above; skip both otherwise), add the package assembly to the router in `Routes.razor`: `<Router AppAssembly="typeof(Program).Assembly" AdditionalAssemblies="new[] { typeof(PlainKit.Blazor.PkAssets).Assembly }">`. Options: `references/setup-and-options.md`. Next, open `references/components-index.md` to find a component and its parameters.

### Add a page (a bound input, a list and a toast)

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
        @foreach (var task in _tasks)
        {
            <div>@task</div>
        }
    </PkListGroup>
</PkStack>

<PkToastStack Position="ToaststackPosition.BottomEnd">
    @if (_toast is not null)
    {
        <PkToast Kind="ToastKind.Success" OnDismiss="@(() => _toast = null)">@_toast</PkToast>
    }
</PkToastStack>

@code {
    private string? _title;
    private string? _toast;
    private readonly List<string> _tasks = [];

    private async Task Add()
    {
        if (string.IsNullOrWhiteSpace(_title)) return;
        _tasks.Add(_title);
        _toast = $"Added {_title}";
        await PkLog.WriteAsync(PkLogLevel.Info, "tasks", "task added", _title);
        _title = null;
    }
}
```

### Add a form

`PkForm` shows the browser's validation in each field and a summary; `OnValid` fires when a submit passes (`OnInvalid` when it is stopped).

```razor
<PkForm Summary OnValid="Save">
    <form @onsubmit:preventDefault>
        <PkField Label="Business name" Required>
            <PkInput @bind-Value="_name" Name="name" Required />
        </PkField>
        <PkFormActions Align="end">
            <PkButton Type="submit" Variant="ButtonVariant.Primary">Save</PkButton>
        </PkFormActions>
    </form>
</PkForm>

@code {
    private string? _name;

    private void Save() => Console.WriteLine($"Saved {_name}");
}
```

### Give a page a header with breadcrumbs

`PkPageHeader` draws the title and a `pk-breadcrumb` from a list of `PkCrumb(Label, Href)`; the last crumb is the current page (`aria-current="page"`) and is the title unless `Title` overrides it. The app looks the route up and passes the list. A page has one h1: with `ShellSection` naming a `SectionOutlet` in the layout's shell title slot, the header writes the title there instead of drawing it. `BackLink` (off by default) adds a chevron link `Back to <crumb>` to the last parent crumb that has an `Href`, before the title in that outlet (above the header without `ShellSection`); leave it off when the layout's `PkAppShell` already sets `BackHref` and `BackLabel`, which the header cannot reach.

```razor
<PkPageHeader Crumbs="@_crumbs" Title="@_name">
    <SuffixContent><PkBadge>Open</PkBadge></SuffixContent>
    <ActionsContent><PkButton>Receive</PkButton></ActionsContent>
</PkPageHeader>

@code {
    private string _name = "Acme Supply order";
    private readonly PkCrumb[] _crumbs = [new("Stock", "/stock"), new("Purchase orders", "/stock/orders"), new("PO 1042")];
}
```

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

`PkTable<TItem>` takes typed columns and items. Write `TItem="Order"` on the component whenever a handler such as `OnRowClick` is a method group: Razor infers `TItem` from `Items` and `Columns` but not through `EventCallback<PkTableRowClickArgs<TItem>>`, so without it the build fails with CS1503 (the same for `PkDataList`). A column's `Text` computes the cell text; its `Cell` template renders markup into the element's `cell-<id>-<key>` slot. Give it `IdOf` for stable row ids. With `Manual` you load, sort and filter yourself: the table shows `Items` as given and reports `OnSort` and `OnFilter`; put a `PkPagination` in `FooterContent`. Blazor renders the cell slots as ordinary children of the element and re-renders them with the `rows` attribute (no per-render JavaScript), so change rows by changing `Items`: the rows are serialised only when `Items` (its reference or count), `Columns` or `IdOf` change, so replace an item inside the same list with a new list, or call `Refresh()` on the table (`@ref`). `CurrentRow` marks the row whose record is open elsewhere (tinted, `aria-current`; set it from the route, the table never changes it); the routed list and detail page with a `PkWorkspace` is the `routed-list-detail` template in the `plainkit-sdk` skill.

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

### Show a searchable, server-paged list (`PkDataList`)

`PkDataList<TItem>` owns search, sort, page, page size and total and calls your `Load` for one page at a time; a new search, sort or page size goes back to page 1, a superseded request is cancelled (pass `request.CancellationToken` to the database), a total that shrinks below the current page settles on the last page, `ReloadAsync()` reloads. Every parameter: `references/data-list.md`. Page anything over a few hundred rows (here or with `Manual` and `PkPagination`): `pk-table` windows its body at 500 rows or more (draws only the rows near the scroll frame's viewport, not an expandable table), but every row still crosses the wire, and the ids of a selection would travel back in one message (SignalR closes the circuit above its 32 KB `MaximumReceiveMessageSize`: about 5,000 numeric ids or 800 GUIDs), so `PkTable` sends a selection of 64 rows or more as runs of row indexes and expands them to ids itself (`Selected` and `OnSelect` still get the ids, in row order); a raw `<pk-table @onpk-select>` gets the whole detail, so raise `AddHubOptions(o => o.MaximumReceiveMessageSize = ...)` if you select thousands of rows there.

```razor
<PkDataList TItem="Customer" @ref="_list" Load="LoadAsync" Columns="_columns" IdOf="c => c.Id.ToString()" Label="Customers"
            SearchPlaceholder="Search customers" AddLabel="+ Add customer" OnAdd="Add" OnRowClick="Open" CurrentId="@_openId" />

@code {
    private async Task<PkListResult<Customer>> LoadAsync(PkListRequest request)
    {
        var query = _db.Customers.Where(c => request.Search == null || c.Name.Contains(request.Search)).OrderBy(c => c.Name);
        var items = await query.Skip(request.Skip).Take(request.PageSize).ToListAsync(request.CancellationToken);
        return new PkListResult<Customer>(items, await query.CountAsync(request.CancellationToken));
    }
    // Columns are PkTableColumn<Customer> records (see references/data-list.md); Open and Add are your handlers.
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

Forwarded entries always use the fixed category `PlainKit.Browser`, rate-limited and stripped of control characters (the browser is untrusted input). Inject `IPkLog` to write your own entries into the browser-side SDK log (they are not echoed back to `ILogger`); show both with `<PkLogs />`. Details: `references/logging.md`.

### Wire the dev tools

In Development, `/_plainkit` serves Gallery, Files, Scorecard, Performance, Console and Logs. Elsewhere set `o.DevTools = true`. Place a single tool on your own page with its component (`<PkLogs Height="26rem" />`, `<PkPerformance />`, `<PkGallery Kind="PkGalleryKind.Elements" />`): `references/devtools.md`. `PkGallery Chrome="PkChrome.Full"` takes `Sections` (a list of `PkGallerySection`: text rows for the Details drawer, per element tag; `PkGallerySection.ForBlazor()` is the component, parameters and Razor section that `/_plainkit` shows), and `Src` may be relative (resolved against the document's base).
