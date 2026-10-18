---
type: changed
issue: 1582
---
The `/_plainkit` dev tools page in PlainKit.Blazor is now one SDK module mounted by a single `PkDevToolsWorkspace` component (the Gallery, Files and Scorecard tabs and the dock), instead of five separate mounts; choosing a tab still navigates to `/_plainkit/<tab>`, and the page looks and behaves as before.
