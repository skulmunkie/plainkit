---
type: added
issue: 529
---
`pk-select` accepts an `options` property (or JSON attribute) as a flat `[{ value, label, disabled? }]` list or grouped `[{ group, options: [...] }]`, built straight into the inner select; slotted `option`/`optgroup` children keep working when `options` is not set.
