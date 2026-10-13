---
title: A routed list and record page in Blazor
order: 10
summary: A PkListPage whose row click navigates to a PkRecordPage on its own route, with Load and Save as your data access.
---

The usual business screen is a pair of routes: a list at `/orders` and one record at `/orders/{id}`. In Blazor each is one config-driven component, and the router is the only thing joining them. Both pages are a thin wrapper over an element, so `Config` is JSON, and `Load` and `Save` are C# delegates you provide. This guide assumes you did [Getting started with Blazor](getting-started-blazor.md).

## The list page

`PkListPage<TItem>` asks `Load` for one page at a time: the request carries the search, the sort, the page and the page size. `OnRowClick` makes the rows clickable and hands you the row key in `Id`. The element cannot call back into C# to compute a link, so you navigate yourself.

```razor
@page "/routed/orders"
@inject NavigationManager Nav

<PkListPage TItem="Order"
            Config="@_config"
            Load="LoadAsync"
            IdOf="o => o.Id"
            OnRowClick="Open" />

@code {
    private const string _config = """{"label":"Orders","pageSize":10,"columns":[{"key":"orderNo","label":"Order","sortable":true},{"key":"customer","label":"Customer"}]}""";

    private Task<PkListResult<Order>> LoadAsync(PkListRequest request) => Orders.PageAsync(request);

    private void Open(PkRowClickEventArgs e) => Nav.NavigateTo($"/routed/orders/{Uri.EscapeDataString(e.Id!)}");
}
```

A column `key` names a property of `TItem` in camel case (`OrderNo` is `orderNo`). Return the items of the requested page and the total of the whole searched list (`PkListResult<T>`); pass `request.CancellationToken` to your database call. Throwing from `Load` shows the element's error state with Retry.

## The record page

`PkRecordPage` takes the record id in `Config` (`id`). The element calls `Load` with it as text; return the values by field name, or null for "not found". `Save` runs after the client validation passes and gets the values by field name as `JsonElement`. Throwing keeps the edits and shows the message; returning switches the page back to view mode.

```razor
@page "/routed/orders/{Id}"

<PkRecordPage Config="@Config" Load="LoadAsync" Save="SaveAsync" />

@code {
    [Parameter] public string Id { get; set; } = "";

    private string Config => System.Text.Json.JsonSerializer.Serialize(new
    {
        id = Id,
        heading = "Order",
        fields = new object[] { new { name = "customer", label = "Customer", required = true }, new { name = "note", label = "Note", type = "textarea" } },
    });

    private Task<IReadOnlyDictionary<string, object?>?> LoadAsync(string id) => Orders.GetAsync(id);

    private Task SaveAsync(IReadOnlyDictionary<string, System.Text.Json.JsonElement> values) =>
        Orders.SaveAsync(Id, values["customer"].GetString() ?? "", values["note"].GetString() ?? "");
}
```

Build the config with a serializer, not by gluing strings, so an id with a quote in it cannot break the JSON.

## What this does not cover

A field value in view mode can be your own markup through `Fields` (a field name to a `RenderFragment`), and a list cell through `Cells` (with `IdOf`). `PkListPage` also takes typed `Columns` (`PkTableColumn<TItem>`, as on `PkDataTable`): they replace the columns of `Config`, and a column's `Cell` template fills that cell of every loaded row. Delete, busy and error are bound from the page: `OnDelete` shows the Delete button in view mode of an existing record, and `Busy` and `Error` are the page's own state. On a `PageBase` page set `Busy="IsBusy"` and `Error="StatusMessage"` and run the handler inside `TryBusyAsync`, which logs a failure, shows it through `DescribeError` and keeps the circuit alive; navigate away when it returns true. Typed field groups and an edit-mode editor are not part of `PkRecordPage` yet; for a form with tabs, sections or a sidebar of your own markup use `PkRecordForm` and `PkRecordEditor` (see the Blazor skill's `references/record-form.md`).

The code above runs in the playground sample (`blazor/samples/PlainKit.Playground`, pages `RoutedOrders` and `RoutedOrder`), which is built with the solution, so it cannot drift from the components.
