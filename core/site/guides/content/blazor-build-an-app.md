---
title: Build an app in Blazor
order: 11
summary: The app frame, modules as data, the route guard and the error boundary in a Blazor app, and the state it shares with the SDK. The running sample is blazor/samples/PlainKit.AppSample.
---

The [Build an app](build-an-app.md) guide describes the SDK framework: a config, one module per part, a page type for every page. A Blazor app gets the same frame and the same module data, with ordinary Razor pages and the Blazor router in place of `mountApp`. This guide assumes you did [Getting started with Blazor](getting-started-blazor.md). Every snippet is from the sample `blazor/samples/PlainKit.AppSample`.

## A module is data

A module's manifest is the JSON the SDK uses (ids, titles, icons, the nav tree and the route-to-page-type table), read by `PkModuleManifest.FromJson`. Its pages are `@page` components whose routes the manifest must agree with.

```csharp
public sealed class OrdersModule() : SampleModule("orders");

builder.Services.AddPlainKitApp(app => app
    .Brand("Demo app")
    .Module<OverviewModule>().Module<OrdersModule>().Module<ReportsModule>()
    .Home("overview").Footer("Plainkit demo app"));
```

## The frame

`PkApp` draws the brand, the module picker, the side nav, the search, the breadcrumb, the footer and the theme toggle from the catalog. Inside it, `PkModuleBoundary` keeps one failing page (or a failed module download) from taking the frame down (it shows an error with Try again) and `PkRouteGuard` is the UX guard.

```text
<PkApp>
    <PkModuleBoundary>
        <PkRouteGuard>
            <Router AppAssembly="typeof(Program).Assembly">
                <Found Context="routeData">
                    <AuthorizeRouteView RouteData="routeData" />
                </Found>
                <NotFound><PkNotFoundPage /></NotFound>
            </Router>
        </PkRouteGuard>
    </PkModuleBoundary>
</PkApp>
```

A module that implements `IPkModuleGuard.CanAsync(PkModuleContext)` is hidden from the picker and shows the not-allowed state when it returns false. That is a UX guard only: `[Authorize]` and your API checks stay the source of truth.

## Lazy modules on WebAssembly

On WebAssembly a module's pages can live in their own assembly, downloaded on the first navigation into the module (and never twice). The module class and its manifest stay in the host, so the nav knows the module before anything downloads; the class implements `IPkLazyModule` and names the assembly (the host's `BlazorWebAssemblyLazyLoad` item):

```text
public sealed class InsightsModule() : SampleModule("insights"), IPkLazyModule
{
    public IReadOnlyList<string> Assemblies { get; } = ["PlainKit.AppSample.Insights.wasm"];
}
```

The host registers `PkLazyModuleLoader` with the platform's `LazyAssemblyLoader` as its one dependency (the package itself needs no WebAssembly reference), also as the `IPkModuleLoader` the guard calls, and gives the router the loaded assemblies and the hook that loads before routes are matched (an in-app click reaches the router before the guard, and a router that cannot match a route reloads the page):

```text
builder.Services.AddSingleton(sp => new PkLazyModuleLoader(sp.GetRequiredService<PkModuleCatalog>(), names => sp.GetRequiredService<LazyAssemblyLoader>().LoadAssembliesAsync(names)));
builder.Services.AddSingleton<IPkModuleLoader>(sp => sp.GetRequiredService<PkLazyModuleLoader>());

<Router AppAssembly="typeof(Program).Assembly" AdditionalAssemblies="Loader.Assemblies" OnNavigateAsync="c => Loader.LoadForPathAsync(c.Path, c.CancellationToken)">
```

A failed download throws to the `PkModuleBoundary` (Try again loads it again). Server registers no loader and loads nothing. `blazor/samples/PlainKit.AppSample.Wasm` is the working host, and `node scripts/blazor-browser.mjs` checks in a browser that the assembly is requested once, on first use.

## A dashboard from the modules' widgets

A module can offer widgets to a dashboard without the dashboard knowing it. Add `contributes` to the module's JSON manifest (the fields of the SDK's config entry, no `can`): `{ "key": "open", "for": ["overview"], "tab": "sales", "label": "Open orders", "kind": "stat", "order": 10 }`. Implement `IPkWidgets.LoadWidget(key)` on the module class (the C# analogue of `widgets: { key: { load } }`) and return what the card draws: a stat's `value`, a chart's properties, never markup. The dashboard page names only the surface and owns the tab labels:

```razor
<PkModuleDashboard Surface="overview" Heading="Overview" Tabs="@Tabs" />
```

`PkModuleDashboard` composes the widgets (`PkDashboardSurface.Compose`, a port of the SDK's `compose`; `core/tests/fixtures/dashboard-compose.json` runs in both test suites) and gives them to `PkDashboardPage`, which owns the card, loading, empty and error states with Retry, the tabs, filters and lazy start. A widget that throws shows only its own error state. Only a composed widget of a registered module is ever answered. Not carried over yet: route curation (`order`, `allow`, `deny`) and the `needs` warning.

## Shared state

`IPkStore`, `IPkSettings` and `IPkTheme` write the same `pk.<module>` envelope as the SDK's store (`{v,data}`, the same validation and migration), so a Blazor app and an SDK page on one origin read the same keys and share the theme. One shared fixture, `core/tests/fixtures/store-envelopes.json`, runs in both test suites. There is no cross-tab sync: a second tab sees a change on its next read, not live. Before the first render there is no storage, so a prerender uses the in-memory fallback.

## Pages

A page derives from `PageBase` and writes markup plus `OnLoadAsync(CancellationToken)`; a list is `PkListPage` or `PkTable`, a record is `PkRecordPage` (see [A routed list and record page in Blazor](blazor-list-and-record.md)).
