---
title: A routed list and record page in Blazor
order: 10
summary: A PkListPage whose row click navigates to a PkRecordPage on its own route, with Load and Save as your data access.
---

The usual business screen is a pair of routes: a list at `/orders` and one record at `/orders/{id}`. In Blazor each is one config-driven component, and the router is the only thing joining them. Both pages are a thin wrapper over an element, so `Config` is JSON, and `Load` and `Save` are C# delegates you provide. This guide assumes you did [Getting started with Blazor](getting-started-blazor.md).

## The list page

`PkListPage<TItem>` asks `Load` for one page at a time: the request carries the search, the sort, the page and the page size. `RowHrefTemplate` (an address with `{id}`, the row key) turns the first cell of each row into a real link to the record page: it opens in a new tab, and a plain click navigates through the router. `OnRowClick` is the alternative when you need a handler (it hands you the row key in `Id`).

```razor
@page "/routed/orders"

<PkListPage TItem="Order"
            Config="@_config"
            Load="LoadAsync"
            IdOf="o => o.Id"
            RowHrefTemplate="/routed/orders/{id}" />

@code {
    private const string _config = """{"label":"Orders","pageSize":10,"columns":[{"key":"orderNo","label":"Order","sortable":true},{"key":"customer","label":"Customer"}]}""";

    private Task<PkListResult<Order>> LoadAsync(PkListRequest request) => Orders.PageAsync(request);
}
```

A column `key` names a property of `TItem` in camel case (`OrderNo` is `orderNo`). Return the items of the requested page and the total of the whole searched list (`PkListResult<T>`); pass `request.CancellationToken` to your database call. Throwing from `Load` shows the element's error state with Retry.

## The record page

`PkRecordPage<TItem>` edits one typed record. `Config` carries the page options and the record id (`id`); `Fields` is a list of `PkFieldSpec<TItem>` (the same specs as `PkFieldGroup`: `Key`, `Label`, `Kind`, `Get`, `Set`, `Required`, `Hint`, `AutoComplete`, `Options`...), so the fields are compile-checked. `PkFieldSpec<TItem>.DateTime(...)` is a date-and-time field (`datetime-local`) over a `DateTime?` property: the value is wall-clock text `yyyy-MM-ddTHH:mm` with no time zone, so convert a UTC or `DateTimeOffset` property yourself. On `PkFieldGroup`, `Columns="3"` lets short fields share a row (one column on a phone), `ColumnSpan` makes a field take two or three columns and `Span` the whole row. The element calls `Load` with the id as text; return the `TItem`, or null for "not found". `Save` runs after the client validation passes and receives the loaded item with the form's values already applied through each field's `Set`. Throwing keeps the edits and shows the message; returning switches the page back to view mode. For a new record (no `id`) set `Model` to the instance to fill; it is what `Save` receives.

```razor
@page "/routed/orders/{Id}"

<PkRecordPage TItem="OrderRecord" Config="@Config" Fields="_fields" Load="Orders.GetAsync" Save="SaveAsync" />

@code {
    [Parameter] public string Id { get; set; } = "";

    private string Config => System.Text.Json.JsonSerializer.Serialize(new { id = Id, heading = "Order" });

    private static readonly IReadOnlyList<PkFieldSpec<OrderRecord>> _fields =
    [
        new() { Key = "customer", Label = "Customer", Required = true, Get = order => order.Customer, Set = (order, v) => order.Customer = v ?? "" },
        new() { Key = "note", Label = "Note", Kind = PkFieldKind.Textarea, Get = order => order.Note, Set = (order, v) => order.Note = v ?? "" },
    ];

    private Task SaveAsync(OrderRecord order) => Orders.SaveAsync(Id, order);
}
```

Build `Config` with a serializer, not by gluing strings, so an id with a quote in it cannot break the JSON. `PkRecordPage` is generic (`TItem`) and the only record page: the older untyped form (`fields` as JSON in `Config`, `Save` receiving a `JsonElement` dictionary) is gone.

## What this does not cover

A field value in view mode can be your own markup through `ViewFields` (a field key to a `RenderFragment`), and a list cell through `Cells` (with `IdOf`). `PkListPage` also takes typed `Columns` (`PkTableColumn<TItem>`, as on `PkDataTable`): they replace the columns of `Config`, and a column's `Cell` template fills that cell of every loaded row, and `Text` fills it with a string (the property fallback is `PkDataTable`'s). Rows are cards below 640px, with `HidePhone` columns dropped and the `Title` column as the heading (`cards` in `Config`, default true unless `selectable`: a card has no select-all). `InitialSearch`, `InitialFilters` (by filter key, shown in the filter panel), `InitialSortKey`, `InitialDescending` and `InitialPage` seed the first request from a route (a deep link such as `?channel=ebay`); the reader replaces them, and `ReloadAsync()` on a component reference loads the current page again after an action. `ActionsContent` fills the title bar (a callback button, or a `PkMenu` of several actions, as on `PkPageHeader`) and `ToolbarContent` the end of the list toolbar; the `actions` of `Config` stay plain link buttons. Delete, busy and error are bound from the page: `OnDelete` shows the Delete button of an existing record, in view and edit mode, and `Busy` and `Error` are the page's own state. On a `PageBase` page set `Busy="IsBusy"` and `Error="StatusMessage"` and run the handler inside `TryBusyAsync`, which logs a failure, shows it through `DescribeError` and keeps the circuit alive; navigate away when it returns true. An exception thrown by `Save` or `Load` shows its message only when it implements `IPkUserFacingException`; for a domain exception base that cannot reference PlainKit.Blazor set `IsUserFacing` (`Func<Exception, bool>`, as on `PkRecordEditor`: `IsUserFacing="@(ex => ex is AppException)"`), which is consulted in addition to the marker (a predicate that throws counts as false); any other exception is logged and shown as a generic line. `When`, `Disabled`, `ReadOnly`, `LabelWhen` and `HelpWhen` are .NET functions of the item, so they are evaluated when the record loads (and after a save), not as the user types; for a condition that follows the user's edits set the string members `WhenExpr`, `DisabledExpr`, `ReadonlyExpr` or `RequiredExpr` (for example `WhenExpr = "status == 'paid' && amount > 100"`): the element evaluates them against the live values, with no server round trip and no lost focus, on a `PkRecordPage` also across its cards (a select in one section can show or disable a field in another section or the sidebar) (field keys, quoted text and numbers, `== != < <= > >=`, `in [a, b]`, `!`, `&&`, `||`; no function calls). For a label or help that must follow the user's edits set `LabelWhenExpr` or `HelpWhenExpr` (conditional text such as `"status == 'paid' ? 'Paid on' : 'Due on'"`; the first true condition's text, a field key giving that field's value, an empty answer keeps `Label` or `Help`). A spec `Editor` is the body of that field in edit mode (the playground's `RoutedOrder` page has a `PkSwitch` for a rush flag): bind its controls to the item's properties. `Sections` and `Sidebar` take `PkRecordSection(Heading, Fields, Columns)`: `Columns: 3` flows a card's short fields side by side in edit mode (one column on a narrow card), and `ColumnSpan` or `Span` on a spec widens a field. `Sticky` pins the title bar to the top of the scrolling page with Edit, Cancel, Save and Delete in it, so a long form keeps them in reach (the same as `PkPageHeader`'s `Sticky`). `BeforeSave` (`Func<TItem, Task<bool>>`) runs once the form is valid and before `Save`, with the item the values were applied to: return false to stop (the page stays in edit mode with the edits), for a confirm of your own such as a dialog saying a rule collides with another record. When the person confirms, call `await page.SaveAsync(skipBeforeSave: true)` on the page (`@ref`): it saves through the same path as the Save button (validation, busy state, dirty reset, the switch to view) and answers true when it was saved. `MainBefore` and `MainAfter` (`PkCard` sections) stay above and below the form in edit mode; for a form with tabs, sections or a sidebar of your own markup use `PkRecordForm` and `PkRecordEditor` (see the Blazor skill's `references/record-form.md`).

`PkListPage` `BeforeListContent` renders your markup between the title bar and the list (a status alert, a summary card): it scrolls with the page, and with `stickyHeader` the list still fills the height left under it, so its column header and pager stay pinned.

The code above runs in the playground sample (`blazor/samples/PlainKit.Playground`, pages `RoutedOrders` and `RoutedOrder`), which is built with the solution, so it cannot drift from the components.
