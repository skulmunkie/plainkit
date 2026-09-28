---
type: added
issue: 324
---
`PkRecordForm` gets an `ActionsInHeader` option: it drops its own toolbar row and exposes the Cancel/Actions/Delete/Save buttons through a `HeaderActions` fragment for the page's `PkPageHeader` to draw instead, so they stay visible in the sticky title bar instead of scrolling away.
