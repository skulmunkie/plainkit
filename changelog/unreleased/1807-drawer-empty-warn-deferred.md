---
type: fixed
issue: 1807
---
pk-drawer and pk-dialog no longer warn "was opened with no heading and no content" when a framework (such as Blazor) sets `open` before the heading and the content in the same render; the check now runs once the render is applied. A panel really opened empty still warns.
