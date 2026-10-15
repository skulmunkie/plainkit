---
type: changed
issue: 1416
---
`pk-doc-page` now declares the detail fields of its `pk-navigate` event (`id`, `anchor`, `replace`) in its element meta, and the Blazor `PkDocPage` gains `OnNavigate` (`PkNavigateEventArgs` with `Id`, `Anchor` and `Replace`), fired when a same-page link in the article is followed. Behaviour in the browser is unchanged.
