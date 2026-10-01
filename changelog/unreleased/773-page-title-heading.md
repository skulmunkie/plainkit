---
type: changed
issue: 773
---
The built-in page types draw their title as a light-DOM `pk-heading level="1"` slotted into the new `title` slot of `pk-page-header`, so every page has exactly one real heading and `mountApp` moves focus to it after a route change (`tabindex="-1"` is set by the page shell). It is a real heading in the heading element's shadow tree, so `querySelector('h1')` no longer finds the title: use `h1, pk-heading[level="1"]`. `pk-page-header` keeps its `heading`, `level` and `::part(title)` (now the title wrapper) and still renders its own heading text when nothing is slotted; Blazor `PkPageHeader` slots the same `pk-heading` for `Title`.
