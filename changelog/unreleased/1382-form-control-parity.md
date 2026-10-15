---
type: added
issue: 1382
---
The Blazor form controls take the parameters their elements document: `Description` (help text) on every control, `IsValid` and `Warning` on `PkInput`, `PkSelect` and `PkTextarea`, `Name`, `Required` and `IsInvalid` where the element has them, and on `PkInput` `MinLength`, `InputMode`, `Decimals`, `Locale` and `AutoHide`. They also raise the native `OnInput` and `OnChange` as a `ChangeEventArgs`. `PkLookupPicker` is not covered yet.
