---
type: added
issue: 1728
---
`PkComponentBase` writes a failed load to the SDK log under an overridable `LogScope`, as `PageBase` does, and has `ReloadParameters` (the parameters whose change reloads; null means any) so a component that takes a record key and display parameters does not reload on the display ones.
