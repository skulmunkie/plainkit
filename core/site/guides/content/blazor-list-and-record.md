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

`PkRecordPage<TItem>` edits one typed record. `Config` carries the page options and the record id (`id`); `Fields` is a list of `PkFieldSpec<TItem>` (the same specs as `PkFieldGroup`: `Key`, `Label`, `Kind`, `Get`, `Set`, `Required`, `Hint`, `Options`...), so the fields are compile-checked. The element calls `Load` with the id as text; return the `TItem`, or null for "not found". `Save` runs after the client validation passes and receives the loaded item with the form's values already applied through each field's `Set`. Throwing keeps the edits and shows the message; returning switches the page back to view mode. For a new record (no `id`) set `Model` to the instance to fill; it is what `Save` receives.

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

A field value in view mode can be your own markup through `ViewFields` (a field key to a `RenderFragment`), and a list cell through `Cells` (with `IdOf`). `PkListPage` also takes typed `Columns` (`PkTableColumn<TItem>`, as on `PkDataTable`): they replace the columns of `Config`, and a column's `Cell` template fills that cell of every loaded row. Delete, busy and error are bound from the page: `OnDelete` shows the Delete button in view mode of an existing record, and `Busy` and `Error` are the page's own state. On a `PageBase` page set `Busy="IsBusy"` and `Error="StatusMessage"` and run the handler inside `TryBusyAsync`, which logs a failure, shows it through `DescribeError` and keeps the circuit alive; navigate away when it returns true. `When`, `Disabled`, `ReadOnly`, `LabelWhen` and `HelpWhen` are .NET functions of the item, so they are evaluated when the record loads (and after a save), not as the user types; for a condition that follows the user's edits set the string members `WhenExpr`, `DisabledExpr`, `ReadonlyExpr` or `RequiredExpr` (for example `WhenExpr = "status == 'paid' && amount > 100"`): the element evaluates them against the live values, with no server round trip and no lost focus (field keys, quoted text and numbers, `== != < <= > >=`, `in [a, b]`, `!`, `&&`, `||`; no function calls). A spec `Editor` is the body of that field in edit mode (the playground's `RoutedOrder` page has a `PkSwitch` for a rush flag): bind its controls to the item's properties. `MainBefore` and `MainAfter` (`PkCard` sections) stay above and below the form in edit mode; for a form with tabs, sections or a sidebar of your own markup use `PkRecordForm` and `PkRecordEditor` (see the Blazor skill's `references/record-form.md`).

The code above runs in the playground sample (`blazor/samples/PlainKit.Playground`, pages `RoutedOrders` and `RoutedOrder`), which is built with the solution, so it cannot drift from the components.
