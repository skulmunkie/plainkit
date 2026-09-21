# PlainKit.Blazor

Blazor components over [Plainkit](https://github.com/skulmunkie/plainkit), the dependency-free HTML, CSS and JavaScript toolkit. Targets .NET 10.

The package carries the whole toolkit as static web assets (`_content/PlainKit.Blazor/plainkit/`), so there is nothing else to install and nothing fetched from a CDN.

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

Serve it outside Development with `AddPlainKit(o => o.DevTools = true)`. Each tool is also a component you can place anywhere: `PkGallery`, `PkCodeExplorer`, `PkScorecard`, `PkPerformance`, `PkConsole`.

## Licence

MIT.
