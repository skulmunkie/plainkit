---
type: added
issue: 1772
---
`PageBase.StatusContent` draws the page's status as one standard `PkAlert` (a failed `OnLoadAsync` shows there as danger), so a page writes `@StatusContent` instead of repeating its own load-error alert; the class example that passed a string `Kind` to `PkAlert` is corrected.
