---
title: Theming and tokens
order: 3
summary: How themes and density work, how to change a colour or a size without touching an element, and how to keep text readable when you do.
---

Plainkit has no theme files. Every colour, space, size, radius and shadow is a CSS custom property (a token), and the two themes and two densities are just different values for the same names. An element reads tokens; it never hard-codes a colour. So theming is overriding a token, in your own stylesheet, and nothing else. The complete list of tokens with their values is in the agent skill's [theming reference](../../dist/skills/plainkit-sdk/references/theming.md); this guide is about how to use them.

## Two themes, on any element

Dark is the default. Set `data-theme="light"` (or `"dark"`) on `<html>` to theme the page, or on any element to theme only that part. The attribute switches which set of colour tokens applies to that element and everything inside it:

```html
<body data-theme="dark">
  <pk-card heading="In the page theme">Dark.</pk-card>
  <section data-theme="light">
    <pk-card heading="In this section">Light, inside a dark page.</pk-card>
  </section>
</body>
```

Add `data-density="compact"` the same way to tighten the spacing roles (the gaps between fields, cards and sections, and the padding of cards, panels, dialogs and cells). Density changes the scale's roles, not the individual tokens, so it works with any theme.

## Switch theme at run time

`plainkit/js/theme.js` has three small functions for the attribute: `setTheme(element, name)`, `toggleTheme(element)` and `currentTheme(element)`. They only set and read `data-theme`; remembering the reader's choice (in storage, a cookie or their profile) is up to your page:

```js
import { setTheme, toggleTheme, currentTheme } from './plainkit/js/theme.js';

const root = document.documentElement;
setTheme(root, 'light');

document.getElementById('theme-button').addEventListener('click', () => {
    toggleTheme(root);
    document.getElementById('theme-label').textContent = `Theme: ${currentTheme(root)}`;
});
```

## Change a token

Override the token in your own stylesheet, after Plainkit's. Tokens are declared once for dark and once for light, so give both themes a value when the colour matters in both:

```css
:root[data-theme="dark"] {
    --color-accent: #7c3aed;
    --color-accent-hover: #8b5cf6;
    --color-accent-fill: #6d28d9;
    --color-accent-fill-hover: #5b21b6;
}

:root[data-theme="light"] {
    --color-accent: #6d28d9;
    --color-accent-hover: #5b21b6;
    --color-accent-fill: #6d28d9;
    --color-accent-fill-hover: #5b21b6;
}
```

Order matters in a stylesheet cascade: link Plainkit first and your file after it (in Blazor, that is why `PkStyles` goes first in the head, see [Getting started with Blazor](getting-started-blazor.md)).

> [!warning] Colours that carry text come in pairs. `--color-accent` is for text, links and borders on the page background. `--color-accent-fill` is for a fill that has text on top of it, such as a primary button, and it is chosen so white text on it reads at 4.5:1 or better, hover included. If you change one, check the other, or your buttons become hard to read.

## The families of tokens

| Family | Names | What it is |
|---|---|---|
| Colour | `--color-bg`, `--color-panel`, `--color-text`, `--color-muted`, `--color-border`, `--color-accent`, `--color-link` | surfaces, text and accents; different in each theme |
| Space | `--space-1` to `--space-12` | the spacing scale; use it for gaps and padding |
| Text | `--text-meta`, `--text-read`, `--text-lg` | font sizes for secondary text, reading text and larger text |
| Shape and depth | `--radius-sm` to `--radius-xl`, `--shadow-card`, `--shadow-modal` | corners and elevation |
| Motion | `--duration-fast`, `--duration-base`, `--duration-slow`, `--ease` | quick UI feedback: hover/focus state changes, expand/collapse, drawer/flyout slide |
| Layers | `--z-sticky`, `--z-modal`, `--z-toast` | stacking order, so a toast is always above a dialog |

Use them in your own CSS too, so your parts follow the theme: `padding: var(--space-4); background: var(--color-panel);` is dark in a dark page and light in a light one, with no extra rules.

## Change one element

Each element also exposes a few hooks of its own, named `--pk-<element>-<part>`. They are listed in the element's API in the [gallery](../gallery/index.html). Set them on the element or on a class, and only that element changes:

```css
.square-button {
    --pk-button-radius: var(--radius-sm);
}
```

Prefer a token when you want to change something everywhere and a hook when you want one element to differ.

## Build a theme with the theme editor

The [Theme editor](../theme/index.html) is the quickest way to a theme of your own. It lists every token with an input for it and applies your edits to the page live. On top of that it can:

- **Generate a palette from one brand colour** (the Palette tab). Give it a colour, and optionally a neutral tint and a warn colour, and it writes the accent, fill, hover and link colours and the text and surface ramps of both themes so that every documented text pair is 4.5:1 or better. Each pair is shown as a swatch with its ratio. If your colour is too light or too dark to be text or a button fill it is moved, and the tab says how far. Apply turns the result into ordinary edits you can still change.
- **Start from a preset or a saved theme** (the Presets tab): the default, a high-contrast theme, a compact and a roomy density, and themes you save by name in this browser.
- **Undo and redo** every change, and list what differs from the stylesheet (the Changes tab), with a reset for each edit and each group of tokens.
- **Audit contrast** (the Contrast tab) for every documented pair in both themes under your edits, with a jump to the token that sets each side.
- **Export** the edits as CSS, as a snippet for a `theme.css` file, as JSON, or as a link: the edits travel in the link's fragment, compressed where the browser can, and are checked like pasted JSON, so a link is text only and never markup.
- **Export a custom SDK** (the Custom SDK tab): a theme-only zip, or the prebuilt `dist` with your theme and your breakpoint widths (see below).

The same tool is available for your own pages:

```js
import { mountThemeEditor } from './plainkit/modules/theme-editor/theme-editor.js';

const editor = await mountThemeEditor(document.getElementById('editor'), { storageKey: 'my-theme', height: '32rem', readHash: true });
editor.applyBrand('#0d9488');
const { url } = await editor.share();
```

An imported override block is validated: names must be lowercase custom properties and values may use only letters, digits and `# % . , ( ) - + /`, so `url()` and comments are refused.

### Ship the exported theme

The export is plain override blocks and needs no runtime. Save it as `theme.css` (the editor's Copy snippet is exactly that file) and link it **after** Plainkit's stylesheet, as a file: a strict `style-src 'self'` refuses an inline `<style>` block. In Blazor the editor takes your saved theme and reports each change with the CSS to save:

```razor
<PkThemeEditor StorageKey="my-theme" InitialTheme="@_theme" OnThemeChanged="css => _theme = css" />

@code {
    private string? _theme;
}
```

### Export a custom SDK

The editor's **Custom SDK** tab makes a download from your theme and your breakpoint widths, and you tick what goes in. The two parts are independent:

- **Theme only** (a small zip): `plainkit-theme.css`, the settings file `plainkit.custom.json` and a `README.md`. No SDK file is touched. Load it after `plainkit.css` as a file, `<link rel="stylesheet" href="plainkit-theme.css">`; in Blazor put it in `wwwroot` and link it after the PlainKit stylesheet in `App.razor` or `_Host.cshtml`. The **Download plainkit-theme.css** button gives just the stylesheet.
- **Breakpoints only**: the release `dist` with the widths of `phone`, `tablet` and `wide` rewritten (in the page layer, in every element module and in the tools' stylesheets), the `--pk-bp-*` properties following, and `dist/manifest.json` recomputed so every file has its size and SRI hash again. The widths are whole pixels from 320 to 2560, ascending, at least 64 apart, and a table lists the elements and properties that change at each breakpoint and the viewport widths whose behaviour flips.
- **Both**: the same `dist` with your theme also written into `plainkit.css` and `plainkit.min.css`, after the token blocks.

Everything happens in the page. The only requests are same-origin reads of the shipped files, and each is checked against its hash in the release manifest before it is used. The zip has the release layout (`dist/`, so it drops in where `dist` is used), the settings and a README naming the version and the settings; paste `plainkit.custom.json` into the tab's Import box to change and export again. Turn the tab off in your own page with `mountThemeEditor(el, { sdk: false })`, or point it at another copy of the files with `dist: '/assets/plainkit/'` (a folder on the same origin).

The [Scorecard](../scorecard/index.html) audits pages and elements at both themes and at a phone width and a wider one, which is a good check after a large change.
