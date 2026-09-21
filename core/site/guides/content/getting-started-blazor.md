---
title: Getting started with Blazor
order: 2
summary: Install PlainKit.Blazor, register it, put PkStyles first in the head, pick a render mode and build a first page from Pk components.
---

`PlainKit.Blazor` is a set of Blazor components over the same elements the SDK is made of: `pk-alert` is `<PkAlert>`, `pk-table` is `<PkTable>`, and every element has one. The package carries the whole toolkit as static web assets, so there is nothing else to install and nothing fetched from a CDN. It targets .NET 10. If you want the plain HTML way, read [Getting started with the SDK](getting-started.md).

> [!warning] The package is a pre-release. Blazor Server and standalone Blazor WebAssembly are verified; what is not is listed in the package README under "Alpha status".

## Install

```bash
dotnet add package PlainKit.Blazor --prerelease
```

Add the namespace once, in `_Imports.razor`. It brings the components, `PkStyles`, `PkAssets` and the enums such as `PkLogLevel`:

```razor
@using PlainKit.Blazor
```

## Register the services

Call `AddPlainKit()` in `Program.cs`. The rest of the file stays as your project template made it:

```csharp
// Program.cs
using PlainKit.Blazor;

builder.Services.AddPlainKit();
```

The optional `.AddPlainKitDevTools()` after `MapRazorComponents<App>()` adds the `/_plainkit` dev tools page, which you can leave out (see the package README, "Dev tools").

## Put PkStyles first in the head

The toolkit's page layer (tokens, base resets and utilities) is meant to be the bottom of your cascade, so it has to come first. Put `<PkStyles />` in the `<head>` of `App.razor`, above your own stylesheets:

```razor
<head>
    <meta charset="utf-8" />
    <PkStyles />
    <link rel="stylesheet" href="app.css" />
    <HeadOutlet />
</head>
```

`<PkStyles />` writes a plain `<link rel="stylesheet">` exactly where you put it, and the browser applies stylesheets in the order of their links. Written in `MainLayout.razor` it ends up in the body, after everything in the head: it still works, but the toolkit's base rules then come last and override yours.

## Choose a render mode

The components need an interactive render mode for `OnClick` and binding to work. Put `@rendermode InteractiveServer` on a page, or set one for the whole app with `<Routes @rendermode="InteractiveServer" />` in `App.razor`. Without a render mode the components render, but nothing responds.

## A first page

```razor
@page "/hello"
@rendermode InteractiveServer

<PkCard Heading="Notifications">
    <PkSwitch @bind-Checked="_notify">Email me about new orders</PkSwitch>
    <p>Notifications are @(_notify ? "on" : "off").</p>
    <PkButton OnClick="Toggle">Turn @(_notify ? "off" : "on")</PkButton>
</PkCard>

@code {
    private bool _notify = true;

    private void Toggle() => _notify = !_notify;
}
```

A component takes its parameters as attributes and sends them to the element as attributes. A value the user changes comes back through a two-way parameter (`@bind-Checked`, `@bind-Value`, `@bind-IsOpen`): while the user interacts the element owns the value, and after its commit event the value is yours, so binding listens for the change and not for every keystroke. Any other attribute (`id`, `class`, `data-*`, `aria-*`) is put on the element as it is. An inline `style` is blocked by the Content Security Policy: use a class.

## Blazor WebAssembly

A standalone Blazor WebAssembly app needs no server and no extra package. It registers the same way (`builder.Services.AddPlainKit()`), and the stylesheet goes first in the head of `wwwroot/index.html` as a plain link, because a static page has no component before the head:

```html
<link rel="stylesheet" href="_content/PlainKit.Blazor/plainkit/plainkit.css" />
```

## Where to go next

- The `plainkit-blazor` agent skill lists every component with its parameters: start with [components-index.md](../../dist/skills/plainkit-blazor/references/components-index.md).
- [Logging](logging.md) shows how the SDK's log reaches `ILogger` and how to write your own entries with `IPkLog`.
- [Theming and tokens](theming.md) works the same in Blazor: the tokens are CSS.
- The [gallery](../gallery/index.html) shows every element; each `Pk` component has the element's props, slots and events.
