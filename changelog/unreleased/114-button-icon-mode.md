---
type: added
issue: 114
---
`pk-button` in icon mode (`icon`, `PkButton Icon`) hides the words in its default slot visually and keeps them as the accessible name, so an icon button is written like any other button (`<pk-button icon icon-name="plus">Add item</pk-button>`); `label` still wins. The new `icon-name` prop (`PkButton IconName`) draws a symbol of the SDK icon sprite and warns once when the name is missing from it. The name is also the native hover tooltip (not read twice, and skipped inside a `pk-tooltip`), a busy icon button swaps its icon for the spinner and keeps its name, and the scorecard now checks `pk-button` so an icon button with no name fails. Buttons that drew a glyph as text (`&#10005;`) with `icon` should use `icon-name="x"`. `PkPageHeader` `BackLink` uses the new form.
