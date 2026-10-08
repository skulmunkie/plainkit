---
type: breaking
issue: 801
---
`PkRawTable` is removed (no obsolete alias): its mode is now part of `PkTable<TItem>`. Replace `<PkRawTable ...>` with `<PkTable TItem="object" ...>`: `HeadContent`, `ChildContent`, `FootContent`, `TableClass`, `IsEmpty`, `EmptyText`, `EmptyContent` and every chrome parameter (`Label`, `Caption`, `Flow`, `Striped`, `Hover`, `Bordered`, `Density`, `StickyHeader`, `StickyColumn`, `MaxHeight`, `ToolbarContent`, `CaptionContent`, `FooterContent`) keep their names and meaning. Setting `ChildContent` selects the raw mode; `Columns` and `Items` are then ignored.
