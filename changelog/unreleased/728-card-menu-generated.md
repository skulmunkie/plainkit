---
type: changed
issue: 728
---
`PkCardMenu` is now generated from the new `pk-card-menu` element instead of hand-written (a Blazor-only behaviour moved into core). Its parameters keep their names (`Label`, `IconName`, `Placement`, `Open`, `OpenChanged`, `ChildContent`, `OnSelect`), and it gains `OnOpen` and `OnClose`. It follows its element's tier like the other generated components: it is in `PlainKit.Blazor.Components` (Razor needs the `@using PlainKit.Blazor.Components` line from the tier-namespace change; C# keeps compiling through the generated alias), and the rendered markup is a `pk-card-menu` instead of a `pk-dropdown` with a `pk-button`.
