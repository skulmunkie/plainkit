---
type: changed
issue: 773
---
Built-in page types now draw their title as a real heading element: the factory appends a light-DOM `pk-heading level="1"` (slot `title`, `tabindex="-1"`) to the page element, and the page's title bar forwards it into the new `title` slot of `pk-page-header`, so every page has exactly one level-1 heading under `main` and `mountApp` moves focus to it after a route change. The title is a real h1 in the heading element's shadow tree, so `querySelector('h1')` no longer finds it: use `h1,pk-heading[level="1"]`. `pk-page-header` keeps `heading`, `level` and `::part(title)` for a header used on its own (the built-in text hides when the `title` slot is filled). Visible change: a built-in page title is the heading element's h3 size (1.17rem), about 1px larger than the previous 1.1rem, and `--pk-page-header-title-size` no longer affects a slotted title. Blazor `PkPageHeader` renders the same slotted `pk-heading` for `Title`.
