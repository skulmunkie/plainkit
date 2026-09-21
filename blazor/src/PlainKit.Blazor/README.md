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

## Licence

MIT.
