---
type: notes
---
The upgrading references (SDK and Blazor skills) say that the `pk-breadcrumb` a `pk-page-header` draws from `crumbs` now lives inside the header's shadow tree: a test, script or style that queries it in the page DOM finds nothing, and `Find("pk-breadcrumb")` in bUnit must become an assertion on the `crumbs` attribute.
