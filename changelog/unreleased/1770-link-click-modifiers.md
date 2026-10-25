---
type: added
issue: 1770
---
`PkLink` has `StopPropagation` and `PreventDefault`: a link inside a clickable row or card no longer also runs the parent's `@onclick`, and an action link with `Href="#"` and `OnClick` no longer follows `#`, so these no longer need raw anchors.
