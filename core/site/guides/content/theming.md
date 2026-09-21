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

## Edit and export with the theme editor

The [Theme editor](../theme/index.html) lists every token with an input for it, applies your edits to the page live, grades the text pairs for contrast, and exports the changes as a block of CSS you can paste into your stylesheet. The same tool is available for your own pages:

```js
import { mountThemeEditor } from './plainkit/theme-editor/theme-editor.js';

const editor = await mountThemeEditor(document.getElementById('editor'), { storageKey: 'my-theme', height: '32rem' });
```

An imported override block is validated: names must be lowercase custom properties and values may use only letters, digits and `# % . , ( ) - + /`, so `url()` and comments are refused.
The [Scorecard](../scorecard/index.html) audits pages and elements at both themes and at a phone width and a wider one, which is a good check after a large change.
