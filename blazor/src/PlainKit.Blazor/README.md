# PlainKit.Blazor

Blazor components over [Plainkit](https://github.com/skulmunkie/plainkit), the dependency-free HTML, CSS and JavaScript toolkit. Targets .NET 10.

The package carries the whole toolkit as static web assets (`_content/PlainKit.Blazor/plainkit/`), so there is nothing else to install and nothing fetched from a CDN.

**Building this repository:** the generated components (`Generated/`) and the package copy of the toolkit (`wwwroot/plainkit/`) are not in git. On a fresh clone run `node scripts/bootstrap.mjs` from the repository root (Node only, about 4 seconds) before `dotnet build` or `dotnet test PlainKit.slnx`; without it the build stops with "Generated files are missing: run node scripts/bootstrap.mjs from the repository root". Consumers of the NuGet package are not affected: the package already contains everything.

## Alpha status

This is a pre-release (`0.1.0-alpha.1`). What it covers and what it does not:

- **Verified:** Blazor Server, driven in a live host (the Playground app: the `/generated` page, the dev tools page, `IPkLog` and the `ILogger` forwarder).
- **Not verified:** Blazor WebAssembly. It has not been run in a WebAssembly host, so treat it as untested there (the Files tool is server-side only by design).
- **Not yet available as a component (1):** `PkTable` (the data grid), whose API is being reworked first. Its element works as plain `<pk-table>` markup. `PkCard`, `PkEmptyState`, `PkFieldList` and `PkStat` are hand-written in `Components/` and available.
- **Wrapper-only parameters not available (12):** behaviour of the old wrappers that is not a property of the element; the manifest gives the reason for each. `PkAppShell`: `ErrorOverlayMessage`, `ShowErrorOverlay` (keep the framework's `#blazor-error-ui` in your layout). `PkDialog`: `CloseButtonLabel`, `FooterAlignEnd`, `OverFlyout`. `PkDrawer`: `Backdrop` (use `Docked`), `IsLoading` (wrap the body in `PkLoadingOverlay`), `PhoneCards`. `PkTooltip`: `DocLink`, `ExternalLink` (use `LinksContent`), `LoadAsync`, `OnClick`. The other five of the original 17 exist now as plain attributes: `PkAlert.Boxed`, `Inline`, `Compact`, `PkDialog.ShowCloseButton` and `PkTooltip.Title`. `PkDialog.Size` (`PkDialogSize`: `Sm`, `Md`, `Lg`, `Xl`, `Fullscreen`; left null the element default applies) and `PkDialog.MaxWidthPx` (the element's `maxWidth`, pixels before the viewport clamp) both work.
- **Structured parameters:** `PkChart.Data`, `PkImageGallery.Images` and the table columns take the public types described under "Types for structured parameters" below.

The full list is in [`generated.manifest.json`](https://github.com/skulmunkie/plainkit/blob/main/blazor/src/PlainKit.Blazor/Generated/generated.manifest.json) in the repository.

## Element components (generated)

Every element has a component, named `Pk` plus the tag in PascalCase, so `pk-alert` is `<PkAlert>`. They are generated from the SDK's element API, so their parameters are the element's props, slots and events. How an element maps to its component is described by the [mapping files](https://github.com/skulmunkie/plainkit/tree/main/blazor/mappings) in the repository.

| The element has | The component gets |
|---|---|
| a prop | a `[Parameter]` sent as an attribute: `bool` is present or absent, numbers use the invariant culture, dates are ISO strings, structures are JSON. A prop with a fixed set of values is an enum (`ButtonVariant`, `PkAlertKind`, ...); a null enum or a nullable number is left off, so the element's own default applies |
| a slot | a `RenderFragment` (`ChildContent` for the default slot; a named slot is rendered as `<span slot="name">`) |
| an event | an `EventCallback`, or `EventCallback<PkXxxEventArgs>` when the event carries a detail (`pk-value-change` gives `PkValueChangeEventArgs`); `click` gives `MouseEventArgs` |
| a value that a change event drives | a two-way parameter: `@bind-Value`, `@bind-Checked`, `@bind-IsOpen` (a `...Changed` callback next to it) |

A component takes its listed parameters, and every other attribute (`id`, `data-*`, `aria-*`, `class`, ...) is put on the element as it is, so `<PkButton id="save" data-test="x" aria-label="Save">` works. A `class` is added to the component's own classes (the components that list `ExtraClass` combine both). An inline `style` is blocked by the CSP: use a class. Each component loads the toolkit through `PkRuntime` on its first render. The `pk-*` events reach Blazor through `PlainKit.Blazor.lib.module.js`, a JavaScript initializer that Blazor loads on its own.

A few components are written by hand rather than generated (`PkCard`, `PkEmptyState`, `PkFieldList`, `PkStat`, `PkGallery`, `PkPageHeader`, `PkStyles`); `PkTable` is not in this package yet. What is not available, with the reason for each item, is in [`generated.manifest.json`](https://github.com/skulmunkie/plainkit/blob/main/blazor/src/PlainKit.Blazor/Generated/generated.manifest.json).

## Types for structured parameters

An element prop that takes a structure (`data`, `images`, `columns`) has a public C# record here, sent to the element as a JSON attribute in camelCase. The generator types a JSON parameter only when it holds simple values, so these parameters are declared `object?`: pass the record (or a list of them) and it is serialised for you.

| Parameter | Pass | Sent as |
|---|---|---|
| `PkChart.Data` | `PkChartData { Labels, Series = [PkChartSeries { Name, Values }] }` | `data="{&quot;labels&quot;:[...],&quot;series&quot;:[{&quot;name&quot;:...,&quot;values&quot;:[...]}]}"` |
| `PkImageGallery.Images` | `IReadOnlyList<PkGalleryImage>` (`Src`, `Alt`, `Primary`, `Status`) | `images="[{&quot;src&quot;:...,&quot;alt&quot;:...}]"` |
| the table's columns | `IReadOnlyList<PkTableColumn>` (`Key`, `Label`, `Type`, `Align`, `Sortable`, `HidePhone`) | `columns="[{&quot;key&quot;:...,&quot;label&quot;:...}]"`; the enums serialise as the element's values (`number`, `end`) |

Fields left at their default are left out of the JSON. Two former parameters became plain element props: `PkDialog.Tint` (`PkDialogTint`: none, product, archived) and the tooltip's `Help` and `Enrich` (booleans) replace the old theme and kind enums. `PkTooltip.Placement` is `PkTooltipPlacement`.

## Set up

Add the namespace to `Program.cs` (`using PlainKit.Blazor;`) and to `_Imports.razor` (`@using PlainKit.Blazor`, which brings `PkStyles`, `PkAssets`, the components and `PkLogLevel`).

```csharp
// Program.cs
using PlainKit.Blazor;

builder.Services.AddPlainKit();

app.MapRazorComponents<App>()
   .AddInteractiveServerRenderMode()
   .AddPlainKitDevTools();          // optional: serves the dev tools page
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
@* Routes.razor: only the dev tools page needs this. Add the AdditionalAssemblies attribute to the Router you already have and keep the rest of it. *@
<Router AppAssembly="typeof(Program).Assembly" AdditionalAssemblies="new[] { typeof(PkAssets).Assembly }">
    ...
</Router>
```

**Render mode.** The components need an interactive render mode for `OnClick` and binding to work: put `@rendermode InteractiveServer` on the page, or set a global render mode (`<Routes @rendermode="InteractiveServer" />` in `App.razor`). Without one they render, but nothing responds.

### Where the stylesheet goes

`<PkStyles />` writes a plain `<link rel="stylesheet">` exactly where you put it. The toolkit's page layer (tokens, base resets and utilities) is meant to be the **bottom** of your cascade, so it has to come **first**: put `<PkStyles />` in the `<head>` of `App.razor`, above your own stylesheets. The browser applies stylesheets in the order of their links, so your `app.css` and scoped bundle then win over the toolkit's base rules of equal specificity.

- In `App.razor`'s head, above the app's links, is the right place.
- Written in `MainLayout.razor` it lands in the body, after everything in the head: it works, but the base layer is then last and overrides your rules.
- `<PkStyles InHead="true" />` renders through `HeadContent` into `<HeadOutlet />`, which comes after the app's stylesheets in the standard `App.razor`. That was how `PkStyles` worked in the first alpha; use it only if you want the base layer last.
- Direct link, no component: `<link rel="stylesheet" href="@PkAssets.CssVersioned" />` in the head, first. `PkAssets.Css` is the file, `PkAssets.CssMin` the minified one and `PkAssets.CssMinVersioned` that with a cache-busting query. `<PkStyles Minified="true" Versioned="false" />` picks the same variants.
- **Cache busting.** `PkAssets.Versioned("js/plainkit.js")` (any file of the toolkit, relative to `PkAssets.Root` or a full path) appends `?v=` and the first 12 characters of the file's SHA-384, so a browser fetches the file again exactly when its content changed. The hash comes from the package's manifest, embedded in the assembly and read once: no file access per request. `PkAssets.Integrity(path)` gives the full `sha384-...` value for an `integrity` attribute. `PkStyles` uses the versioned URL by default (`Versioned="false"` turns it off).

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
@* MainLayout.razor: the shell's title slot holds the one h1 (pk-app-shell's title slot and its back-href / back-label are new in the SDK) *@
<pk-app-shell back-href="@_parentHref" back-label="@_parentLabel">
    <h1 slot="title"><SectionOutlet SectionName="shell-title" /></h1>
    ...
</pk-app-shell>

@* the page *@
<PkPageHeader ShellSection="shell-title" Crumbs="@_crumbs" />
```

The header writes plain text into the outlet, so the layout decides the element around it (an `h1` here). Until `PkAppShell` gets `TitleContent`, `BackHref` and `BackLabel` parameters (the mapping follows the SDK), use the `pk-app-shell` element directly, as above.

## How binding works

The components follow the rules in `core/STANDARDS.md` ("Ownership and reactivity"):

- **Attributes down.** A parameter is written as an attribute of the element when it changes. No JavaScript runs for it: there is no interop per render or per parameter change. The only calls are the one-time `EnsureInitialized` on the first render and the methods you call yourself.
- **Events up.** A two-way parameter (`@bind-Value`) commits on the element's own change event (`pk-value-change`, `pk-change`, `pk-tab-change`, ...), which fires when the user commits a change, not on every keystroke. Until then the element owns the value; after the callback runs, your component owns it. Re-render with the value you were given and nothing fights it.
- **Your markup stays yours.** An element does not add, remove or reorder the children you render (the `<option>` items of a combobox, the tabs of a `PkTabs`). It draws inside its own shadow tree.
- **A list of tags is yours to remove.** `PkTag` is `Controlled` by default: a press raises `OnRemove` and the tag never removes itself, so remove it from your own list in the handler (the DOM and Blazor's tree then agree). Set `Controlled="false"` only for a tag that is not in a Blazor-rendered list.
- **A form reset raises no change event** (as with native controls): a value your component mirrors keeps its old value after `form.reset()`. `PkForm.OnReset` runs after the controls have their initial values again; set your model back there.
- **Tools own a container.** `PkLogs`, `PkScorecard`, `PkConsole`, `PkPerformance`, `PkCodeExplorer` and `PkLogSettings` render an empty `<div>` and hand it to JavaScript; do not put your own children in it. They mount when first rendered, mount again only when a parameter that changes the tool changes, and are destroyed when the component is disposed.

## Dev tools (built in)

In the Development environment, `/_plainkit` serves the toolkit's own tools, all built from the SDK. The page renders inside your app's own layout (it is a routable component like any other, so your `MainLayout` and stylesheets apply), and it is served only in Development unless you turn it on (below). It has three workspaces, and the SDK's dev tools dock (`mountDevTools`, through `PkDevTools`) over it. ``Ctrl+` `` shows and hides the dock; `/_plainkit/console` and the like open it on that tab.

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

**The Blazor section of the inspector** (Components tab) is built from `blazor/mappings/*.json` and the generator's manifest, which the package carries inside its assembly (`PkMappingInfo`); the SDK holds no copy. For an element it shows the component (generated, hand-written or not available yet), each parameter, event and content slot with its type, the element's default and whether it is two-way, why a parameter is not generated when it is not, and the equivalent Razor (the example's attributes as parameters, enums as `ButtonVariant.Primary`, a two-way value as `@bind-Value`). The gallery's own inspector cannot show it yet: it has no hook to pass `extraSections` (see Known limits).

Serve it outside Development with `AddPlainKit(o => o.DevTools = true)` (keep it behind your own authorisation if you do). Each tool is also a component you can place anywhere: `PkGallery`, `PkCodeExplorer`, `PkScorecard`, `PkPerformance`, `PkConsole`, `PkLogs`, `PkLogSettings`, `PkQuality`, `PkThemeEditor` and `PkDevTools`. JavaScript owns everything inside a tool's element (Blazor renders no children in it) and the component lets go of it when disposed.

```razor
<PkDevTools />                                       @* the dock, on any page (Ctrl+` toggles it) *@
<PkDevTools Mode="PkDevToolsMode.Inline" Tab="quality" />   @* the same tabs filling this element *@
<PkQuality AutoRun="true" Height="24rem" />
<PkThemeEditor StorageKey="my-theme" Preview="false" />
```

**Known limits.** The gallery is a `<pk-gallery>` element that runs in its own frame, and the SDK's `mountGallery` takes no `extraSections`, so the Blazor section shows in the Components tab and not inside the gallery's Details drawer. Until the SDK adds a hook, `blazorInspectorSections(host)` in `wwwroot/blazor-devtools.js` is the section, ready to pass to `createElementInspector(...).show({ meta, element, extraSections })`. Also: `<pk-gallery>` resolves its `src` against the page's URL rather than the document's base, so a relative `src` misses on a routed page like `/_plainkit/gallery`; `/_plainkit` gives it an absolute address.

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

Forwarded entries use the category `PlainKit.<scope>` and map debug, info, warn, error to Debug, Information, Warning, Error. To see the forwarder work, put a misspelt element on a page, for example `<pk-buton></pk-buton>`: the SDK's loader logs the warning "`<pk-buton>` is not a Plainkit element" (scope `loader`, once per tag and page), and it appears in your `ILogger` output as a `Warning` in the category `PlainKit.loader`. The forwarder starts with the first PlainKit component (or `IPkLog` call) on a circuit or page and stops with it. Inject `IPkLog` to write your own entries into the SDK log, so the logs viewer (`PkLogs`, the dev tools' Logs tab) shows them beside the SDK's; entries written that way are not echoed back to `ILogger`, so there is no loop. Use `ILogger` for your logs as usual; `IPkLog` is for messages you want in the browser-side log. It is designed to work in Blazor Server and WebAssembly (only Server is verified, see Alpha status), and its calls do not throw while prerendering or after the circuit disconnects.

```csharp
@inject IPkLog PkLog
await PkLog.WriteAsync(PkLogLevel.Warn, "checkout", "Card declined", detail: orderId);
await PkLog.SetLevelAsync(PkLogLevel.Debug);
```

## Agent skills

The package serves two skills for developer agents (Claude Code and others) as static web assets, next to the toolkit: `plainkit-blazor` (these components, their parameters, enums and events, `AddPlainKit`, `PkOptions`, `IPkLog`, the dev tools, what is not available yet) and `plainkit-sdk` (the underlying `pk-*` elements, needed for the raw elements that have no component yet). Each is a short `SKILL.md` plus plain markdown `references/`, generated from the same sources as the components and tested, at the version of this package.

- **Claude Code:** copy the two folders into `.claude/skills/` of your project (or `~/.claude/skills/`). Get them from the `plainkit-skills-<version>.zip` on the [GitHub release](https://github.com/skulmunkie/plainkit/releases), or from a running app: `_content/PlainKit.Blazor/plainkit/skills/<skill>/SKILL.md` and `.../references/<file>.md` (verified in Development).
- **Any other agent:** read the markdown under `references/` (start with `components-index.md`); nothing in it is specific to one tool.

### Using the skills with an agent

**1. Install them where the agent looks.** Claude Code reads a skill folder from `.claude/skills/` in the project (or `~/.claude/skills/` for every project) and loads a skill on its own when the task matches the skill's `description`; there is nothing to enable. Pick the way you got Plainkit:

| You have | Install (from the project root) |
|---|---|
| The GitHub release | `gh release download v0.1.0-alpha.1 --repo skulmunkie/plainkit --pattern "plainkit-skills-*.zip"` then unzip into `.claude/skills/` (each skill is one folder: `plainkit-sdk/`, `plainkit-blazor/`) |
| The NuGet package (PlainKit.Blazor) | copy `<version>/staticwebassets/plainkit/skills/*` from the NuGet cache into `.claude/skills/`; `dotnet nuget locals global-packages -l` prints the cache folder (usually `~/.nuget/packages/plainkit.blazor/`) |
| The npm package | copy `node_modules/plainkit/dist/skills/*` into `.claude/skills/` |
| A clone (after `node scripts/bootstrap.mjs`) or the `dist` zip | copy `core/dist/skills/*` (in the zip: `skills/*`) into `.claude/skills/` |
| Nothing local, only the internet | each file is also served at `https://skulmunkie.github.io/plainkit/dist/skills/<skill>/SKILL.md` (and `.../references/<file>.md`) |

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
