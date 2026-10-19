---
type: changed
issue: 1582
---
The hand-written `PkDevToolsPage` is retired: `PkDevToolsWorkspace` now carries the `/_plainkit` and `/_plainkit/{Tab}` routes and navigates when a tab is chosen, so the URLs are unchanged. Code that rendered `<PkDevToolsPage>` directly renders `<PkDevToolsWorkspace>` instead.
