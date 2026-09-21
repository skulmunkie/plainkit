# PlainKit.Blazor

Blazor components over [Plainkit](https://github.com/skulmunkie/plainkit), the dependency-free HTML, CSS and JavaScript toolkit. Targets .NET 10.

The package carries the whole toolkit as static web assets (`_content/PlainKit.Blazor/plainkit/`), so there is nothing else to install and nothing fetched from a CDN.

## Where the element mappings live

How each SDK element becomes a component (its `Pk` name, parameters, slots and events) is not in the SDK's element metadata: it is one file per element in [`blazor/mappings/`](../../mappings), starting overrides for the wrapper generator (issue #2). `scripts/tests/blazor-mappings.test.mjs` checks them against `core/elements/*/*.meta.json`.

## Set up

```csharp
// Program.cs
builder.Services.AddPlainKit();

app.MapRazorComponents<App>()
   .AddInteractiveServerRenderMode()
   .AddPlainKitDevTools();          // optional: serves the dev tools page
```

```razor
@* Routes.razor: only needed for the dev tools page *@
<Router AppAssembly="typeof(Program).Assembly" AdditionalAssemblies="new[] { typeof(PlainKit.Blazor.PkAssets).Assembly }">
```

```razor
@* MainLayout.razor *@
<PkStyles />
```

## Dev tools (built in)

In the Development environment, `/_plainkit` serves the toolkit's own tools, all built from the SDK:

| Tab | What it does |
|---|---|
| Gallery | Every control, element, layout and template with live samples |
| Files | Browse your project's source (server-side only) |
| Scorecard | Score pages for accessibility, layout, spacing and touch targets at every theme and width |
| Performance | Live Core Web Vitals, frame rate, long tasks, DOM size, heap, what loaded |
| Console | `console.*`, errors, SDK events, network, `pk-*` elements on the page, environment |

Serve it outside Development with `AddPlainKit(o => o.DevTools = true)`. Each tool is also a component you can place anywhere: `PkGallery`, `PkCodeExplorer`, `PkScorecard`, `PkPerformance`, `PkConsole`.

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

Forwarded entries use the category `PlainKit.<scope>` and map debug, info, warn, error to Debug, Information, Warning, Error. The forwarder starts with the first PlainKit component (or `IPkLog` call) on a circuit or page and stops with it. Inject `IPkLog` to write your own entries into the SDK log, so the logs viewer (`PkLogs`, the dev tools' Logs tab) shows them beside the SDK's; entries written that way are not echoed back to `ILogger`, so there is no loop. Use `ILogger` for your logs as usual; `IPkLog` is for messages you want in the browser-side log. It works the same in Blazor Server and WebAssembly, and its calls do not throw while prerendering or after the circuit disconnects.

```csharp
@inject IPkLog PkLog
await PkLog.WriteAsync(PkLogLevel.Warn, "checkout", "Card declined", detail: orderId);
await PkLog.SetLevelAsync(PkLogLevel.Debug);
```

## Licence

MIT.
