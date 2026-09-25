---
type: added
issue: 270
---
`PkFieldSpec<TItem>` gains `LabelAction` (`RenderFragment<TItem>?`): extra content in the field's label-action slot beside the label text, after the Help tooltip when both are set, re-evaluated each render. Adopt-from-source buttons and flag badges no longer need a hand-written `PkField` wrapper.
