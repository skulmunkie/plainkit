---
type: added
issue: 1582
---
A dev tools workspace module, `mountDevToolsWorkspace` in `modules/devtools/workspace.js`: the Gallery, Files and Scorecard tabs and the dev tools dock in one call. Each workspace loads on first use, and the gallery sections, the source snapshot or provider and the score targets are options (`update()` hands them over after the mount), so a host such as PlainKit.Blazor can mount the whole dev tools page from one component.
