---
type: added
issue: 61
---
`pk-button` renders as a real link with `href` (plus `target`, `rel`, which defaults to `noopener` for `_blank`, and `download`): the control is an anchor with the same variants, sizes, icons and busy style, so middle and ctrl-click and the status-bar URL work and Space does not activate it; a disabled or busy link drops its href and reports `aria-disabled`. `PkButton` gains `Href`, `Target`, `Rel` and `Download`, and `OnClick` still fires for a link.
