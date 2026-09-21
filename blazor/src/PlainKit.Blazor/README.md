# PlainKit.Blazor

Blazor components over [Plainkit](https://github.com/skulmunkie/plainkit), the dependency-free HTML, CSS and JavaScript toolkit. Targets .NET 10.

The package carries the whole toolkit as static web assets (`_content/PlainKit.Blazor/plainkit/`), so there is nothing else to install and nothing fetched from a CDN.

## Alpha status

This package is a pre-release. What it covers and what it does not:

- **Verified:** Blazor Server, driven in a live host (the Playground app: the `/generated` page, the dev tools page, `IPkLog` and the `ILogger` forwarder).
- **Verified:** standalone Blazor WebAssembly (.NET 10, a normal publish needs no wasm workload), driven in headless Chrome against the `PlainKit.WasmPlayground` sample (`blazor/samples/`): the assets, the `pk-*` events into `EventCallback`s, `@bind-Value`, `@bind-Checked` and `@bind-IsOpen`, `PkTable<TItem>` events, `PkDataList<TItem>`, `AddPlainKit` with the `ILogger` forwarder and `IPkLog`, and the dev tools page. See "Blazor WebAssembly" for the setup and the limits: the Files tool needs a server, and AOT and the `InteractiveWebAssembly` render mode of a Web App were not run.
- **Every element has a component.** `PkCard`, `PkEmptyState`, `PkFieldList`, `PkStat` and `PkTable<TItem>` (the data table) are hand-written in `Components/`, and so is `PkDataList<TItem>` (a searchable, sortable, server-paged list; it has no element of its own): see "Tables and lists" below.
- **Wrapper-only parameters not available (12):** behaviour of the old wrappers that is not a property of the element; the manifest gives the reason for each. `PkAppShell`: `ErrorOverlayMessage`, `ShowErrorOverlay` (keep the framework's `#blazor-error-ui` in your layout). `PkDialog`: `CloseButtonLabel`, `FooterAlignEnd`, `OverFlyout`. `PkDrawer`: `Backdrop` (use `Docked`), `IsLoading` (wrap the body in `PkLoadingOverlay`), `PhoneCards`. `PkTooltip`: `DocLink`, `ExternalLink` (use `LinksContent`), `LoadAsync`, `OnClick`. The other five of the original 17 exist now as plain attributes: `PkAlert.Boxed`, `Inline`, `Compact`, `PkDialog.ShowCloseButton` and `PkTooltip.Title`. `PkDialog.MaxWidthPx` works: it sets the element's `maxWidth` (pixels before the viewport clamp).
- **Structured parameters:** `PkChart.Data`, `PkImageGallery.Images` and the table columns take the public types described under "Types for structured parameters" below.

The full list is in `references/known-gaps.md` of the `plainkit-blazor` skill (see "Agent skills" below).

## Element components (generated)

Every element has a component, named `Pk` plus the tag in PascalCase, so `pk-alert` is `<PkAlert>`. They are generated from the SDK's element API, so their parameters are the element's props, slots and events. How an element maps to its component is described by the [mapping files](https://github.com/skulmunkie/plainkit/tree/main/blazor/mappings) in the repository.

| The element has | The component gets |
|---|---|
| a prop | a `[Parameter]` sent as an attribute: `bool` is present or absent, numbers use the invariant culture, dates are ISO strings, structures are JSON. A prop with a fixed set of values is an enum (`ButtonVariant`, `PkAlertKind`, ...); a null enum or a nullable number is left off, so the element's own default applies |
| a slot | a `RenderFragment` (`ChildContent` for the default slot; a named slot is rendered as `<span slot="name">`). Body markup next to a named slot needs an explicit `<ChildContent>`, see below |
| an event | an `EventCallback`, or `EventCallback<PkXxxEventArgs>` when the event carries a detail (`pk-value-change` gives `PkValueChangeEventArgs`); `click` gives `MouseEventArgs` |
| a value that a change event drives | a two-way parameter: `@bind-Value`, `@bind-Checked`, `@bind-IsOpen`, `@bind-Open` (a `...Changed` callback next to it) |

**Body next to a named slot.** As soon as you use a named slot such as `FooterContent`, Razor no longer treats the rest of the markup as `ChildContent`: write it inside an explicit `<ChildContent>` element (without it the compiler stops with RZ9996, "Unrecognized child content inside component"):

```razor
<PkDialog @bind-IsOpen="_open" Title="Discard changes?">
    <ChildContent><p>This cannot be undone.</p></ChildContent>
    <FooterContent><PkButton OnClick="@(() => _open = false)">Close</PkButton></FooterContent>
</PkDialog>
```

A component takes its listed parameters, and every other attribute (`id`, `data-*`, `aria-*`, `class`, ...) is put on the element as it is, so `<PkButton id="save" data-test="x" aria-label="Save">` works. A `class` is added to the component's own classes (the components that list `ExtraClass` combine both). An inline `style` is blocked by the CSP: use a class. Each component loads the toolkit through `PkRuntime` on its first render. The `pk-*` events reach Blazor through `PlainKit.Blazor.lib.module.js`, a JavaScript initializer that Blazor loads on its own (see "Events on raw elements").

## Reading uploaded files (`PkDropzone` with `InputFile`)

`PkDropzone` keeps its own file input inside the element, where Blazor cannot read it, so `OnFiles` reports only counts. To read the bytes, place Blazor's own `InputFile` in the dropzone's `input` slot: the zone then only draws the drop target and `InputFile` (a real `<input type="file">` that Blazor owns) does the reading, so `InputFileChangeEventArgs` and `IBrowserFile` come from Blazor with no custom interop. Nothing is marshalled per render, and it works the same in Blazor Server and Blazor WebAssembly.

```razor
@using Microsoft.AspNetCore.Components.Forms

<PkDropzone Label="Files to upload" BrowseLabel="Choose files" Multiple="true">
    <ChildContent>
        <InputFile slot="input" multiple OnChange="OnChange" />
        Drop files here or click to choose
    </ChildContent>
    <HintContent>Text files, up to 1 MB each</HintContent>
</PkDropzone>

@code {
    private async Task OnChange(InputFileChangeEventArgs e)
    {
        foreach (var file in e.GetMultipleFiles(10))
        {
            using var stream = file.OpenReadStream(1024 * 1024); // maxAllowedSize is yours to set (default 500 KB)
            // copy or read the stream
        }
    }
}
```

- `slot="input"` goes on the `InputFile` itself, as a direct child of `PkDropzone`, so the input covers the whole zone. Once a named fragment such as `HintContent` is used, the title and the `InputFile` go in an explicit `<ChildContent>`.
- A drop and the picker (the zone, or the `BrowseLabel` button) both raise the `InputFile`'s `OnChange`: on a drop the element puts the dropped files into that input and raises `change`. A single-file input (no `multiple`) keeps the first dropped file.
- In this mode `OnChange` is the source of truth. The zone does not apply `Accept`, `MaxFileSizeBytes` or `MaxFiles`, draws no file list and does not raise `OnFiles`: set `accept` and `multiple` on the `InputFile`, check `IBrowserFile.Size` and `ContentType`, and pass the size limit to `OpenReadStream`.
- Why not an event that carries the files: a .NET side cannot read a browser `File` except through `InputFile`'s own machinery (or a custom stream interop per file), so the slot reuses the one path Blazor already supports. The sample page `/upload` in `blazor/samples/PlainKit.Playground` is the working example.

## Events on raw elements

Every `pk-*` event of every element is registered with Blazor and mapped to its args class, whether or not a component listens for it, so a raw element in Razor works with typed handlers and no JavaScript:

```razor
<pk-table manual clickable columns="@Columns" rows="@Rows" @onpk-sort="OnSort" @onpk-row-click="OnRow"></pk-table>

@code {
    private void OnSort(PkSortEventArgs e) => Console.WriteLine($"{e.Key} {e.Direction}");
    private void OnRow(PkRowClickEventArgs e) => Console.WriteLine(e.Id);
}
```

Blazor delivers a custom DOM event only when two things are true: it is registered in the browser (`Blazor.registerCustomEventType`, done for all of them by `PlainKit.Blazor.lib.module.js`) and an `[EventHandler("onpk-sort", typeof(...))]` attribute maps the name to an `EventArgs` type. The Razor compiler only looks for those attributes on a class named exactly `EventHandlers`; the package has a generated one (`Generated/PkGeneratedEvents.cs`) with all of them, so `@using PlainKit.Blazor` is all you need (a `@onpk-...` attribute that is not matched is rendered as a literal attribute named `@onpk-...` and never fires). The args classes are `Pk` plus the event name in PascalCase plus `EventArgs` (`pk-row-click` gives `PkRowClickEventArgs`); `references/events.md` in the skill lists them. The old workaround (an ES module that adds listeners through an `ElementReference` and calls back with `DotNetObjectReference`) is not needed.

## Tables and lists

`PkTable<TItem>` is a typed table over `pk-table`; `PkDataList<TItem>` is a searchable, sortable, server-paged list built on it.

```razor
<PkTable TItem="Order" Items="_orders" Columns="_columns" IdOf="o => o.Number.ToString()" Label="Orders" Manual Clickable
         @bind-Sort="_sort" @bind-SortDirection="_dir" OnSort="Reload" OnRowClick="Open">
    <FooterContent><PkPagination Page="_page" Total="_total" PageChanged="GoTo" Label="Order pages" /></FooterContent>
</PkTable>
```

- **Write `TItem` when a handler is a method group.** Razor infers `TItem` from `Items` and `Columns`, but not through an `EventCallback<PkTableRowClickArgs<TItem>>`: `OnRowClick="Open"` with `Open` a method fails to compile (CS1503, "cannot convert from method group") unless you write `TItem="Order"` on the component, as above. The same holds for `PkDataList` (`<PkDataList TItem="Customer" ... OnRowClick="Open">`).
- **Columns** are `PkTableColumn<TItem>` records: `Key`, `Label`, `Type`, `Align`, `Sortable`, `HidePhone`, and what fills the cell: `Text` (a `Func<TItem, string?>`, sent in the row under `Key`) or `Cell` (a `RenderFragment<TItem>` rendered into the element's `cell-<id>-<key>` slot). The JSON is camelCase, as `PkTableColumn` shows. **A `Key` is used exactly as you give it**, in the column definition, in the row, in the `cell-<id>-<key>` slot and in the keys the table reports (`Sort`, `OnSort`, `Filters`, and `PkListRequest.SortKey` in `PkDataList`): nothing is renamed, so `Key = "Name"` and `Key = "name"` both work (a column with neither `Text` nor `Cell` finds the item property whatever the casing) and a host can map `SortKey` to a repository column as it is.
- **Rows** are `Items`, serialised camelCase, with the row key `id` from `IdOf` (the row index when there is none). Give `IdOf` whenever the order can change.
- **Manual** (server-driven) mode: the table shows `Items` exactly as given and reports `OnSort` (`PkSortEventArgs`, `Key` and `Direction`), `OnFilter` and, from the footer, the pager's page events; you load the matching rows. `Sort`, `SortDirection`, `Filters`, `Selected` and `Expanded` are two-way (`@bind-Sort`): while the user interacts the element owns the value, after the event you own it. `OnRowClick` gives a `PkTableRowClickArgs<TItem>` (`Id`, `Item`); `OnRowExpand` and `DetailTemplate` (rendered into `detail-<id>` slots, with `Expandable`) follow the element.
- **Ownership.** Rows and columns are JSON attributes rebuilt when the parameters are set: no JavaScript per render. Cell and detail templates are ordinary Blazor children of the element (the element reads them and never rewrites them), so a change of rows re-renders them together with the `rows` attribute; change the rows by changing `Items`. A `pk-select` that bubbles up from a menu in a cell is ignored (only the table's carries `selected`).
- **Slots**: `ToolbarContent` (in a `pk-cluster`), `BulkContent`, `CaptionContent`, `EmptyContent`, `FooterContent` (put a `PkPagination` here); `EmptyText`, `Loading`, `Cards`, `Striped`, `Hover`, `Bordered`, `Density`, `StickyHeader`, `StickyColumn`, `MaxHeight`, `Label`, `Caption`, `Flow`, `Selectable`, `Clickable`, `Filterable` are the element's own props.

```razor
<PkDataList TItem="Customer" Load="LoadAsync" Columns="_columns" IdOf="c => c.Id.ToString()" Label="Customers"
            SearchPlaceholder="Search customers" AddLabel="+ Add customer" OnAdd="Add" OnRowClick="Open" CurrentId="@_openId" />

@code {
    private async Task<PkListResult<Customer>> LoadAsync(PkListRequest request)
    {
        var query = _db.Customers.Where(c => request.Search == null || c.Name.Contains(request.Search)).OrderBy(c => c.Name);
        var items = await query.Skip(request.Skip).Take(request.PageSize).ToListAsync(request.CancellationToken);
        return new PkListResult<Customer>(items, await query.CountAsync(request.CancellationToken));
    }
}
```

`Load` gets a `PkListRequest(Search, SortKey, Descending, Page /* 1-based */, PageSize)` and returns a `PkListResult<T>(Items, Total)`. The component owns the state and follows these rules: a new search, sort or page size returns to page 1; the search box debounces itself (`SearchDebounceMs`, the element's own timer, so the component runs no timer and no JavaScript); a request replaced by a newer one has its `CancellationToken` cancelled and its result ignored, so no stale rows flash; the table is `loading` while a request is in flight; when the total shrinks below the current page (rows deleted elsewhere) it settles on the last page that exists and loads it; the empty state has its own text (`EmptyText`, `NoResultsText` for a search, or `EmptyContent`); a throwing `Load` shows an error with Retry (`OnLoadError` reports it). `ReloadAsync()` loads the current page again after the host saved something. `OnRowClick` gives the item; `CurrentId` marks the open row for a master and detail layout. The first column is the row's identity: it stays in the phone `cards` layout and holds the keyboard-reachable link. Search state lives only in the component; the initial `PageSize`, `SortKey` and `Descending` are parameters.

The table marks the open record with `CurrentRow` (the id of the row: it is tinted, gets an accent bar and `aria-current`). You set it, for example from the route; the table never changes it and raises no event for it. `PkDataList` passes it through (`CurrentRow`); its older `CurrentId`, which bolds the first cell, still works. The routed list and detail page (list in the main pane, the record in the aside of a `PkWorkspace`) is the `routed-list-detail` template; the `plainkit-blazor` skill has the page skeleton.
Rows are keyboard stops, a third click on a sortable header clears the sort, and a `HidePhone` column is hidden in the `cards` layout too.

What is not generated is listed in `references/known-gaps.md` of the skill: components whose mapping says `existing` (hand-written in `Components/`: `PkCard`, `PkEmptyState`, `PkFieldList`, `PkGallery`, `PkPageHeader`, `PkStat`, `PkTable`; `PkStyles` and `PkDataList` have no element), dynamic slots, wrapper-only behaviour and CSS-property parameters.

## Large tables and the circuit's message limit

Measured (`scripts/bench/blazor.mjs`, Blazor Server, five columns): a `PkTable<T>` sends about 80 bytes per row to the browser (100 rows 11 KB, 1,000 rows 79 KB,
5,000 rows 387 KB), and `pk-table` draws every row it is given (10,000 rows take about 2 s to render). The limit that bites is the other direction: SignalR
refuses a message the browser sends that is larger than `MaximumReceiveMessageSize` (32 KB by default) and **closes the circuit**. With `Selectable`, "select all"
sends every row id back in one `pk-select` event: about 6 bytes per id for numbers, about 40 for GUIDs, so 5,000 numeric ids (33 KB) or about 800 GUID ids are enough
to lose the circuit. So:

- Page big data: `PkDataList` (or `PkTable` in `Manual` mode with a `PkPagination`) keeps a page at 10 to 100 rows, sorts and filters on the server, and never
  approaches the limit. Use it above a few hundred rows.
- If a large `Selectable` table is unavoidable, raise the limit for the hub in your app: `builder.Services.AddServerSideBlazor().AddHubOptions(o => o.MaximumReceiveMessageSize = 1024 * 1024);`
  (Blazor Web App: `AddInteractiveServerComponents(o => ...)` takes hub options), and prefer short row ids.
- Every parent re-render of a `PkTable` serialises all of its rows again, even when `Items` did not change (5,000 rows: about 70 ms and 9 MB allocated); keep the
  table's parent small, or pass a new list only when the data changed.

## Types for structured parameters

An element prop that takes a structure (`data`, `images`, `columns`) has a public C# record here, sent to the element as a JSON attribute in camelCase. The parameter is declared with that type (`PkChart.Data` is a `PkChartData?`, `PkImageGallery.Images` an `IReadOnlyList<PkGalleryImage>?`), so the compiler checks what you pass; the value is serialised for you.

| Parameter | Pass | Sent as |
|---|---|---|
| `PkChart.Data` | `PkChartData { Labels, Series = [PkChartSeries { Name, Values }] }` | `data="{&quot;labels&quot;:[...],&quot;series&quot;:[{&quot;name&quot;:...,&quot;values&quot;:[...]}]}"` |
| `PkImageGallery.Images` | `IReadOnlyList<PkGalleryImage>` (`Src`, `Alt`, `Primary`, `Status`) | `images="[{&quot;src&quot;:...,&quot;alt&quot;:...}]"` |
| the table's columns | `IReadOnlyList<PkTableColumn<TItem>>` for `PkTable`/`PkDataList` (`Key`, `Label`, `Type`, `Align`, `Sortable`, `HidePhone`, `Text`, `Cell`); the plain `PkTableColumn` record is the JSON shape for a raw `<pk-table>` | `columns="[{&quot;key&quot;:...,&quot;label&quot;:...}]"`; the enums serialise as the element's values (`number`, `end`) |

Fields left at their default are left out of the JSON. Two former parameters became plain element props: `PkDialog.Tint` (`PkDialogTint`: none, product, archived) and the tooltip's `Help` and `Enrich` (booleans) replace the old theme and kind enums. `PkTooltip.Placement` is `PkTooltipPlacement`.

## Set up

This is the Blazor Server / Web App setup; for a standalone Blazor WebAssembly app see "Blazor WebAssembly" below.

Add the namespace to `Program.cs` (`using PlainKit.Blazor;`) and to `_Imports.razor` (`@using PlainKit.Blazor`, which brings `PkStyles`, `PkAssets`, the components and `PkLogLevel`).

```csharp
// Program.cs
using PlainKit.Blazor;

builder.Services.AddPlainKit();

app.MapRazorComponents<App>()
   .AddInteractiveServerRenderMode()
   .AddPlainKitDevTools();          // optional: only for the /_plainkit dev tools page (see "Dev tools")
```

```razor
@* App.razor: the stylesheet goes first in the head, see "Where the stylesheet goes" *@
<head>
    <meta charset="utf-8" />
    <base href="/" />
    <PkStyles />
    <link rel="stylesheet" href="app.css" />
    <HeadOutlet />
</head>
```

```razor
@* Routes.razor: needed only for the /_plainkit dev tools page (skip it, and AddPlainKitDevTools above, if you do not use it). Add the AdditionalAssemblies attribute to the Router you already have and keep the rest of it. *@
<Router AppAssembly="typeof(Program).Assembly" AdditionalAssemblies="new[] { typeof(PkAssets).Assembly }">
    ...
</Router>
```

**Render mode.** The components need an interactive render mode for `OnClick` and binding to work: put `@rendermode InteractiveServer` on the page, or set a global render mode (`<Routes @rendermode="InteractiveServer" />` in `App.razor`). Without one they render, but nothing responds.

### The skills, the references and the most-used parameters

The package carries two agent skills, `plainkit-blazor` and `plainkit-sdk`, and their `references/` folders hold every component with its parameters, enums and events. **Start with `references/components-index.md`** (in the `plainkit-blazor` skill): it lists every component and names the file with its parameters. Copy the skills into your project once (see "Agent skills" below for every source):

```bash
# the NuGet cache folder: dotnet nuget locals global-packages -l
cp -r ~/.nuget/packages/plainkit.blazor/<version>/staticwebassets/plainkit/skills/* .claude/skills/
```

The most-used parameters (the full lists are in the references):

| Component | Parameters |
|---|---|
| `PkCard` | `Heading` (the title), `Level` (heading level), `Tone`, `Href`, `ChildContent`, `FooterContent` |
| `PkEmptyState` | `Title`, `Description`, `ActionContent` |
| `PkStat` | `Label`, `Value`, `Delta`, `DeltaUnit`, `Subtext`, `Tone` |
| `PkAlert` | `Kind` (`PkAlertKind`), `Title`, `Message`, `Dismissible`, `OnDismiss`, `Inline`, `Compact` |
| `PkTooltip` | `Text`, `Placement` (`PkTooltipPlacement`), `Help`, `LinksContent`, `ChildContent` |
| `PkMenuItem` | `Value`, `Href`, `Disabled`, `Danger`, `Checked`, `OnSelect`, `SubmenuContent` |

### Where the stylesheet goes

`<PkStyles />` writes a plain `<link rel="stylesheet">` exactly where you put it. The toolkit's page layer (tokens, base resets and utilities) is meant to be the **bottom** of your cascade, so it has to come **first**: put `<PkStyles />` in the `<head>` of `App.razor`, above your own stylesheets. The browser applies stylesheets in the order of their links, so your `app.css` and scoped bundle then win over the toolkit's base rules of equal specificity.

- In `App.razor`'s head, above the app's links, is the right place.
- Written in `MainLayout.razor` it lands in the body, after everything in the head: it works, but the base layer is then last and overrides your rules.
- `<PkStyles InHead="true" />` renders through `HeadContent` into `<HeadOutlet />`, which comes after the app's stylesheets in the standard `App.razor`. That was how `PkStyles` worked in the first alpha; use it only if you want the base layer last.
- Direct link, no component: `<link rel="stylesheet" href="@PkAssets.CssVersioned" />` in the head, first. `PkAssets.Css` is the file, `PkAssets.CssMin` the minified one and `PkAssets.CssMinVersioned` that with a cache-busting query. `<PkStyles Minified="true" Versioned="false" />` picks the same variants.
- **Cache busting.** `PkAssets.Versioned("js/plainkit.js")` (any file of the toolkit, relative to `PkAssets.Root` or a full path) appends `?v=` and the first 12 characters of the file's SHA-384, so a browser fetches the file again exactly when its content changed. The hash comes from the package's manifest, embedded in the assembly and read once: no file access per request. `PkAssets.Integrity(path)` gives the full `sha384-...` value for an `integrity` attribute. `PkStyles` uses the versioned URL by default (`Versioned="false"` turns it off).

### Blazor WebAssembly

A standalone Blazor WebAssembly app needs no server and no extra package; the sample `blazor/samples/PlainKit.WasmPlayground` is the whole thing (build it explicitly with `dotnet publish blazor/samples/PlainKit.WasmPlayground -c Release -o <dir>`; it is not in `PlainKit.slnx` because it downloads the browser runtime packs). What differs from Server:

- **Register the same way** (`builder.Services.AddPlainKit(...)` in `Program.cs`, including `o.Logging.ForwardToILogger`; the default browser console logger writes the forwarded entries to the console). No `CircuitHandler` is registered (there is no circuit): the dev tools' Blazor tab shows "Blazor WebAssembly" and no circuit facts.
- **The stylesheet goes first in the head of `wwwroot/index.html`**, as a plain link: `<link rel="stylesheet" href="_content/PlainKit.Blazor/plainkit/plainkit.css" />` (a static page has no component before the head).
- **Events work through the library's JavaScript initializer.** Blazor WebAssembly calls its `afterStarted` hook (`afterWebStarted` is only called by the Web App runtime); the initializer registers every `pk-*` event there, so `@onpk-...` and every generated `EventCallback` work.
- **The dev tools page** (`/_plainkit`) is routable with `AdditionalAssemblies` on the router, as on Server (a standalone app has no `MapRazorComponents`, so no `AddPlainKitDevTools`). It serves in the `Development` environment (`dotnet run`, or a publish with `-p:WasmApplicationEnvironmentName=Development`) and otherwise says it is off: set `AddPlainKit(o => o.DevTools = true)`. The **Files** workspace reads a folder on the server, so in a browser-only app it shows "No source to browse" instead of failing.
- **The package keeps the ASP.NET Core server framework a private compile-time reference** (`PrivateAssets="all"`), because a public framework reference cannot be restored by a WebAssembly app (NETSDK1082). A Blazor Server app has the framework from its own SDK; a plain class library that uses the package's server types needs its own `<FrameworkReference Include="Microsoft.AspNetCore.App" />`.
- **Not verified:** AOT, the `InteractiveWebAssembly` render mode of a Blazor Web App (the same components, but no such host was run) and an ASP.NET Core hosted deployment.

### Page header

`PkPageHeader` is the top of a page: the title and a `pk-breadcrumb` built from a list of `PkCrumb(Label, Href)`. The last crumb is the current page (`aria-current="page"`), and the title is its label unless you pass `Title` (a record's name, say). `SuffixContent` goes beside the title (a status chip, a count); `ActionsContent` and `MetaContent` fill the element's other slots. Which crumbs belong to a route is your app's business (a lookup by route, a page registry): the header only draws the list.

```razor
<PkPageHeader Crumbs="@_crumbs" Title="@_order.Name">
    <SuffixContent><PkBadge>@_order.Status</PkBadge></SuffixContent>
    <ActionsContent><PkButton OnClick="Receive">Receive</PkButton></ActionsContent>
</PkPageHeader>

@code {
    private IReadOnlyList<PkCrumb> _crumbs = [new("Stock", "/stock"), new("Purchase orders", "/stock/orders"), new("PO 1042")];
}
```

A page has one `<h1>`, in one place: the header's title, or the app shell's title slot. To put it in the shell's top bar, give the layout a `SectionOutlet` in the `title` slot of `pk-app-shell` and name it in `ShellSection`; the header then writes the title there and does not draw it a second time (it still draws the breadcrumb, the suffix and the actions):

```razor
@* MainLayout.razor: the shell's title slot holds the one h1 (the shell's title slot, back-href and back-label) *@
<pk-app-shell back-href="@_parentHref" back-label="@_parentLabel">
    <h1 slot="title"><SectionOutlet SectionName="shell-title" /></h1>
    ...
</pk-app-shell>

@* the page *@
<PkPageHeader ShellSection="shell-title" Crumbs="@_crumbs" />
```

**Back link.** `BackLink="true"` draws a chevron link to the parent page (icon mode: the text `Back to <label>` is hidden visually and stays its accessible name): the last crumb before the current one that has an `Href` (crumbs without an address are skipped; with none there is no link). It is a ghost `PkButton` with `Href` (a real anchor, touch-sized on a phone, focus ring, no inline style). With `ShellSection` it is written into the outlet before the title, so the layout's element around the outlet contains it (an `h1` then names the link too; a wrapper element that is not the heading avoids that); without `ShellSection` it sits just above the header. It is off by default because `pk-app-shell` has its own back link (`BackHref` and `BackLabel`, set in the layout, which a page's header cannot reach): use one or the other, never both. If the layout owns the shell, feed `BackHref` and `BackLabel` from the same crumbs; if it does not, set `BackLink`.

Apart from the back link the header writes plain text into the outlet, so the layout decides the element around it (an `h1` here). `PkAppShell` has `TitleContent`, `BackHref` and `BackLabel` parameters too; the example uses the element directly so the `h1` sits in the `title` slot itself (a `TitleContent` fragment is wrapped in a `<span slot="title">`).

## How binding works

The components follow the rules in `core/STANDARDS.md` ("Ownership and reactivity"):

- **Attributes down.** A parameter is written as an attribute of the element when it changes. No JavaScript runs for it: there is no interop per render or per parameter change. The only calls are the one-time `EnsureInitialized` on the first render and the methods you call yourself.
- **Events up.** A two-way parameter (`@bind-Value`) commits on the element's own change event (`pk-value-change`, `pk-change`, `pk-tab-change`, ...), which fires when the user commits a change, not on every keystroke. Until then the element owns the value; after the callback runs, your component owns it. Re-render with the value you were given and nothing fights it.
- **Your markup stays yours.** An element does not add, remove or reorder the children you render (the `<option>` items of a combobox, the tabs of a `PkTabs`). It draws inside its own shadow tree.
- **A list of tags is yours to remove.** `PkTag` is `Controlled` by default: a press raises `OnRemove` and the tag never removes itself, so remove it from your own list in the handler (the DOM and Blazor's tree then agree). Set `Controlled="false"` only for a tag that is not in a Blazor-rendered list.
- **Open state is two-way where the element reports it.** `@bind-Open` works on `PkCombobox` (it follows `pk-combo-toggle`), `PkCommandPalette` (it follows `pk-open` and `pk-close`) and `PkMenuItem` (its submenu, from `pk-submenu-toggle`), as `@bind-IsOpen` does on `PkDialog`. The element owns the state while the user works (typing, a click, Escape, Ctrl/Cmd+K); after the event your field holds the new value, and setting it from C# opens or closes the element. `PkCommandPalette` also raises `pk-open` for a change the host made, which finds the parameter already equal, so nothing loops. `OnToggle`, `OnOpen` and `OnClose` still run after the binding has updated.
- **A form reset raises no change event** (as with native controls): a value your component mirrors keeps its old value after `form.reset()`. `PkForm.OnReset` runs after the controls have their initial values again; read them back there with `PkRuntime.ReadFormValuesAsync(form.Element)` (inject `PkRuntime`, keep the `PkForm` with `@ref`; the controls need a `Name`). It returns the values by control name, one call, no per-component interop:

  ```razor
  <PkForm @ref="_form" OnReset="Resync">
      <form>
          <PkInput @bind-Value="_name" Name="name" />
          <PkButton Type="reset">Reset</PkButton>
      </form>
  </PkForm>
  @code {
      [Inject] private PkRuntime Runtime { get; set; } = default!;
      private PkForm? _form; private string? _name = "Ada";
      private async Task Resync() => _name = (await Runtime.ReadFormValuesAsync(_form!.Element)).GetValueOrDefault("name");
  }
  ```
- **Tools own a container.** `PkLogs`, `PkScorecard`, `PkConsole`, `PkPerformance`, `PkCodeExplorer` and `PkLogSettings` render an empty `<div>` and hand it to JavaScript; do not put your own children in it. They mount when first rendered, mount again only when a parameter that changes the tool changes, and are destroyed when the component is disposed.

## Dev tools (built in)

In the Development environment, `/_plainkit` serves the toolkit's own tools (this needs `.AddPlainKitDevTools()` and the `AdditionalAssemblies` line of "Set up"; nothing else in the package does, and the page itself is optional), all built from the SDK. The page renders inside your app's own layout (it is a routable component like any other, so your `MainLayout` and stylesheets apply), and it is served only in Development unless you turn it on (below). It has three workspaces, and the SDK's dev tools dock (`mountDevTools`, through `PkDevTools`) over it. ``Ctrl+` `` shows and hides the dock; `/_plainkit/console` and the like open it on that tab.

| Workspace (the page's menu) | What it does |
|---|---|
| Gallery | Every control, element, layout and template with live samples |
| Files | Browse your project's source (server-side only) |
| Scorecard | Score pages for accessibility, layout, spacing and touch targets at every theme and width |

| Dock tab | What it does |
|---|---|
| Console | `console.*`, errors, SDK events, network, `pk-*` elements on the page, environment |
| Logs, Logging | What the SDK and your app logged through the Plainkit logger, and its settings (level per scope, where each level goes) |
| Performance | Live Core Web Vitals, frame rate, long tasks, DOM size, heap, what loaded |
| Quality | The SDK's page checks (accessibility, layout, spacing, touch targets, focus) on the live page, with a score |
| Inspector | The `pk-*` elements on the page, with the attributes that configure them |
| Theme | The theme editor, live on the page |
| Blazor | PlainKit.Blazor's own tab (below) |
| Components | Pick any element and see the SDK's element inspector with a Blazor section: its component, parameters and the Razor for its example |

**The Blazor tab** shows only what can be observed, nothing estimated. The circuit: its state (Opened, Connected, Disconnected, Closed), id, age, how many times the connection dropped and came back, from the framework's own circuit events (`PkCircuitState`, Blazor Server only), plus the reconnect UI events this browser saw. The runtime: host, .NET, package and JavaScript versions, whether the runtime started, whether the SDK log is forwarded to `ILogger`. JS interop: every call PlainKit components send through their bridge, counted and timed per function (`PkRuntime.Interop`), with the errors that came back; a `mount*` call's time is that tool's mount time (on Blazor Server it includes the network hop). The SDK's log buffer, counted by level with its newest warnings and errors. It does not show Blazor's render-tree timings, because nothing in the runtime layer exposes them, and it does not see calls your app makes on its own `IJSRuntime`.

**The Blazor section of the inspector** (Components tab) is built from `blazor/mappings/*.json` and the generator's manifest, which the package carries inside its assembly (`PkMappingInfo`); the SDK holds no copy. For an element it shows the component (generated, hand-written or not available yet), each parameter, event and content slot with its type, the element's default and whether it is two-way, why a parameter is not generated when it is not, and the equivalent Razor (the example's attributes as parameters, enums as `ButtonVariant.Primary`, a two-way value as `@bind-Value`). The gallery's Details drawer shows it too: `<PkGallery Chrome="PkChrome.Full" Sections="...">` takes the section as text data (see below).

Serve it outside Development with `AddPlainKit(o => o.DevTools = true)` (keep it behind your own authorisation if you do; the `PkDevTools` dock follows the same rule, so one left in a layout renders nothing in production, and the Files tab never lists `appsettings*.json`, `secrets.json`, `launchSettings.json` or other credential files). Each tool is also a component you can place anywhere: `PkGallery`, `PkCodeExplorer`, `PkScorecard`, `PkPerformance`, `PkConsole`, `PkLogs`, `PkLogSettings`, `PkQuality`, `PkThemeEditor` and `PkDevTools`. JavaScript owns everything inside a tool's element (Blazor renders no children in it) and the component lets go of it when disposed.

```razor
<PkDevTools />                                       @* the dock, on any page (Ctrl+` toggles it) *@
<PkDevTools Mode="PkDevToolsMode.Inline" Tab="quality" />   @* the same tabs filling this element *@
<PkQuality AutoRun="true" Height="24rem" />
<PkThemeEditor StorageKey="my-theme" Preview="false" />
<PkThemeEditor InitialTheme="@_savedThemeCss" Presets="_presets" OnThemeChanged="css => _savedThemeCss = css" />
```

**The theme editor** starts from `InitialTheme` (the override CSS it exports, or its JSON; used when nothing was kept for the viewer under `StorageKey`), lists your `Presets` (`new PkThemePreset("Brand", css, "Our colours")`, CSS or JSON text) after the built-in ones, and raises `OnThemeChanged` with the exported CSS a moment after every change. Everything else (the brand palette generator, saved themes, undo and redo, the change list, the shareable link, the contrast audit) is inside the tool.

**Shipping an exported theme.** The exported CSS is plain override blocks (`:root, [data-theme="dark"] { ... }` and `[data-theme="light"] { ... }`) and needs no runtime. Save it as a file in your app (for example `wwwroot/theme.css`, from `OnThemeChanged` at design time or from the editor's Copy snippet) and link it **after** the toolkit's stylesheet, so its custom properties win: `<PkStyles />` first, then `<link rel="stylesheet" href="theme.css" />`. A file works under a strict `style-src 'self'`; an inline `<style>` block does not. There is nothing to configure in `PkOptions`. Keep the file: the editor's JSON (Export / import tab) is the way back into it, and a link from the editor's "Create link" carries the same edits in its fragment.

**The gallery's Details drawer.** `<PkGallery Chrome="PkChrome.Full" Sections="...">` takes a list of `PkGallerySection` (text data only: the gallery runs in its own frame, so the SDK passes the description across by message, never code). `PkGallerySection.ForBlazor()` builds the Blazor section (component, parameters, the Razor for the example), which is what `/_plainkit/gallery` passes. A relative `src` on `<pk-gallery>` resolves against the document's base address, so it also works on a routed page. `blazorInspectorSections(host)` in `wwwroot/blazor-devtools.js` is the same section for `createElementInspector(...).show({ meta, element, extraSections })` in a page of your own.

## Logging

The SDK has one logger (`js/log.js`). Configure it, and optionally forward its entries to `ILogger`, through `PkOptions.Logging`:

```csharp
builder.Services.AddPlainKit(o =>
{
    o.Logging.Level = PkLogLevel.Info;                      // the SDK's global level, applied at startup
    o.Logging.Scopes["loader"] = PkLogLevel.Debug;          // a level for one scope
    o.Logging.Routes[PkLogLevel.Error] = ["console", "toast"];
    o.Logging.ForwardToILogger = true;                      // off by default
    o.Logging.ForwardMinimumLevel = PkLogLevel.Warn;        // the forwarder's own filter
    o.Logging.ForwardScopes.Add("pk-*");                    // empty means every scope; ForwardExcludeScopes wins
});
```

Forwarded entries use the category `PlainKit.<scope>` and map debug, info, warn, error to Debug, Information, Warning, Error. To see the forwarder work, put a misspelt element on a page, for example `<pk-buton></pk-buton>`: the SDK's loader logs the warning "`<pk-buton>` is not a Plainkit element" (scope `loader`, once per tag and page), and it appears in your `ILogger` output as a `Warning` in the category `PlainKit.loader`. The forwarder starts with the first PlainKit component (or `IPkLog` call) on a circuit or page and stops with it. Inject `IPkLog` to write your own entries into the SDK log, so the logs viewer (`PkLogs`, the dev tools' Logs tab) shows them beside the SDK's; entries written that way are not echoed back to `ILogger`, so there is no loop. Use `ILogger` for your logs as usual; `IPkLog` is for messages you want in the browser-side log. It works in Blazor Server and in standalone WebAssembly (both verified, see Alpha status), and its calls do not throw while prerendering or after the circuit disconnects.

```csharp
@inject IPkLog PkLog
await PkLog.WriteAsync(PkLogLevel.Warn, "checkout", "Card declined", detail: orderId);
await PkLog.SetLevelAsync(PkLogLevel.Debug);
```

**Version check.** The package and the JavaScript it serves are one version. When the page loads a different copy (a stale cache, a CDN or a self-hosted copy of `core/dist`), the runtime logs one warning per runtime, once at startup, to `ILogger` (category `PlainKit.blazor`) and to the SDK log (scope `blazor`, so the Logs tab shows it); the Blazor dev tools tab shows both versions as well.

## Agent skills

The package serves two skills for developer agents (Claude Code and others) as static web assets, next to the toolkit: `plainkit-blazor` (these components, their parameters, enums and events, `AddPlainKit`, `PkOptions`, `IPkLog`, the dev tools, what is not available yet) and `plainkit-sdk` (the underlying `pk-*` elements, needed for the raw elements that have no component yet). Each is a short `SKILL.md` plus plain markdown `references/`, generated from the same sources as the components and tested, at the version of this package.

- **Claude Code:** copy the two folders into `.claude/skills/` of your project (or `~/.claude/skills/`). Get them from the `plainkit-skills-<version>.zip` on the [GitHub release](https://github.com/skulmunkie/plainkit/releases), or from a running app: `_content/PlainKit.Blazor/plainkit/skills/<skill>/SKILL.md` and `.../references/<file>.md` (verified in Development).
- **Any other agent:** read the markdown under `references/` (start with `components-index.md`); nothing in it is specific to one tool.

### Using the skills with an agent

**1. Install them where the agent looks.** Claude Code reads a skill folder from `.claude/skills/` in the project (or `~/.claude/skills/` for every project) and loads a skill on its own when the task matches the skill's `description`; there is nothing to enable. Pick the way you got Plainkit:

| You have | Install (from the project root) |
|---|---|
| The GitHub release | `gh release list --repo skulmunkie/plainkit` shows the versions, then `gh release download <tag> --repo skulmunkie/plainkit --pattern "plainkit-skills-*.zip"` (for example the newest tag), then unzip into `.claude/skills/` (each skill is one folder: `plainkit-sdk/`, `plainkit-blazor/`) |
| The NuGet package (PlainKit.Blazor) | copy `<version>/staticwebassets/plainkit/skills/*` from the NuGet cache into `.claude/skills/`; `dotnet nuget locals global-packages -l` prints the cache folder (usually `~/.nuget/packages/plainkit.blazor/`) |
| The npm package | copy `node_modules/plainkit/dist/skills/*` into `.claude/skills/` |
| A clone (after `node scripts/bootstrap.mjs`) or the `dist` zip | copy `core/dist/skills/*` (in the zip: `skills/*`) into `.claude/skills/` |
| Nothing local, only the internet | each file is also served on the [Pages site](https://skulmunkie.github.io/plainkit/) at `dist/skills/<skill>/SKILL.md` (and `dist/skills/<skill>/references/<file>.md`) |

Commit the folders to the project so every agent and teammate gets them, and re-copy them when you upgrade Plainkit (they carry the version of the release they came from, in their first lines).

**2. Tell the agent to use them.** For Claude Code the skill triggers by itself when you ask for UI work in a project that uses Plainkit, but it helps to say it once in the project's `CLAUDE.md`. For any other agent, put the same text in that agent's instructions file (`AGENTS.md`, or its equivalent) and point it at the markdown, which is plain and not specific to one tool:

```markdown
## UI: Plainkit
This project builds its UI with Plainkit (`pk-*` custom elements and the PlainKit.Blazor `Pk*` components).
Before writing or changing UI, use the `plainkit-blazor` and `plainkit-sdk` skills (in `.claude/skills/`; the files under `references/` are plain markdown, start with `components-index.md`).
Use only the elements, parameters, slots and events those references list. If something you need is not there, say so instead of inventing it.
Check `known-gaps.md` before assuming a component exists.
```

**3. Check that it works.** Ask the agent something the skill can answer, for example "which `pk-*` element shows a dismissible message, and what events does it fire?" It should name `pk-alert` and `pk-dismiss` from the reference rather than guess. If it does not mention the skill, confirm the folders are directly under `.claude/skills/` (each with a `SKILL.md`).

## Licence

MIT.
