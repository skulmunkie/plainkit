# PlainKit.Blazor

Blazor components over [Plainkit](https://github.com/skulmunkie/plainkit), the dependency-free HTML, CSS and JavaScript toolkit. Targets .NET 10.

The package carries the whole toolkit as static web assets (`_content/PlainKit.Blazor/plainkit/`), so there is nothing else to install and nothing fetched from a CDN.

## Alpha status

This is a pre-release (`0.1.0-alpha.1`). What it covers and what it does not:

- **Verified:** Blazor Server, driven in a live host (the Playground app: the `/generated` page, the dev tools page, `IPkLog` and the `ILogger` forwarder).
- **Not verified:** Blazor WebAssembly. It has not been run in a WebAssembly host, so treat it as untested there (the Files tool is server-side only by design).
- **Not yet available as components (5):** `PkCard`, `PkEmptyState`, `PkFieldList`, `PkStat` and `PkTable` (the data grid). Their elements work as plain `<pk-card>` etc. markup.
- **Wrapper-only parameters not generated (17):** behaviour of the old wrappers that is not a property of the element. `PkAlert`: `Boxed`, `Compact`, `Inline`. `PkAppShell`: `ErrorOverlayMessage`, `ShowErrorOverlay`. `PkDialog`: `CloseButtonLabel`, `FooterAlignEnd`, `OverFlyout`, `ShowCloseButton`. `PkDrawer`: `Backdrop`, `IsLoading`, `PhoneCards`. `PkTooltip`: `DocLink`, `ExternalLink`, `LoadAsync`, `OnClick`, `Title`. (`PkDialog.MaxWidthPx` is also not generated: it sets a CSS custom property, which needs a CSSOM helper because the CSP blocks inline styles.)
- **Parameters with a type not defined yet (4, issue #9):** `PkChart.Data` and `PkImageGallery.Images` (not generated), `PkDialog.Theme` and `PkTooltip.Kind` (not generated).

The full list is in [`Generated/generated.manifest.json`](Generated/generated.manifest.json) (a repository file, not part of the package) and `node scripts/generate-blazor.mjs --list`.

## Where the element mappings live

How each SDK element becomes a component (its `Pk` name, parameters, slots and events) is not in the SDK's element metadata: it is one file per element in [`blazor/mappings/`](../../mappings). `scripts/tests/blazor-mappings.test.mjs` checks them against `core/elements/*/*.meta.json`.

## Element components (generated)

`node scripts/generate-blazor.mjs` writes one Razor component per element into [`Generated/`](Generated), from `core/dist/elements/api.json` (props, slots, events and their details) and the mapping. Never edit those files: change the mapping or the SDK and run it again (`--check` fails when they are stale; CI runs it). The component is `Pk` plus the tag in PascalCase, so `pk-alert` is `<PkAlert>`.

| The element has | The component gets |
|---|---|
| a prop | a `[Parameter]` sent as an attribute: `bool` is present or absent, numbers use the invariant culture, dates are ISO strings, structures are JSON. A prop with a fixed set of values is an enum (`ButtonVariant`, `NoticeKind`, ...); a null enum or a nullable number is left off, so the element's own default applies |
| a slot | a `RenderFragment` (`ChildContent` for the default slot; a named slot is rendered as `<span slot="name">`) |
| an event | an `EventCallback`, or `EventCallback<PkXxxEventArgs>` when the event carries a detail (`pk-value-change` gives `PkValueChangeEventArgs`); `click` gives `MouseEventArgs` |
| a value that a change event drives | a two-way parameter: `@bind-Value`, `@bind-Checked`, `@bind-IsOpen` (a `...Changed` callback next to it) |

`ExtraClass` and any attribute that matches no parameter go on the element. Each component loads the toolkit through `PkRuntime` on its first render. The `pk-*` events reach Blazor through `PlainKit.Blazor.lib.module.js`, a JavaScript initializer that Blazor loads on its own.

What is not generated is listed in [`Generated/generated.manifest.json`](Generated/generated.manifest.json): components whose mapping says `existing` (`PkGallery` is hand-written in `Components/`; `PkCard`, `PkEmptyState`, `PkFieldList`, `PkStat` and `PkTable` are not in this package yet), parameters that need a type this repository does not define yet (issue #9), dynamic slots, wrapper-only behaviour and CSS-property parameters.

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
| Logs | What the SDK and your app logged through the Plainkit logger (`PkLogs`), and the logging settings (`PkLogSettings`) |

Serve it outside Development with `AddPlainKit(o => o.DevTools = true)`. Each tool is also a component you can place anywhere: `PkGallery`, `PkCodeExplorer`, `PkScorecard`, `PkPerformance`, `PkConsole`, `PkLogs`, `PkLogSettings`.

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

Forwarded entries use the category `PlainKit.<scope>` and map debug, info, warn, error to Debug, Information, Warning, Error. The forwarder starts with the first PlainKit component (or `IPkLog` call) on a circuit or page and stops with it. Inject `IPkLog` to write your own entries into the SDK log, so the logs viewer (`PkLogs`, the dev tools' Logs tab) shows them beside the SDK's; entries written that way are not echoed back to `ILogger`, so there is no loop. Use `ILogger` for your logs as usual; `IPkLog` is for messages you want in the browser-side log. It is designed to work in Blazor Server and WebAssembly (only Server is verified, see Alpha status), and its calls do not throw while prerendering or after the circuit disconnects.

```csharp
@inject IPkLog PkLog
await PkLog.WriteAsync(PkLogLevel.Warn, "checkout", "Card declined", detail: orderId);
await PkLog.SetLevelAsync(PkLogLevel.Debug);
```

## Licence

MIT.
