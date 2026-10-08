---
type: fixed
issue: 839
---
`pk-popover` returns focus to the real control when its trigger slot holds a wrapper such as the Blazor `display: contents` span, and `pk-dropdown` and `pk-popover` put `aria-haspopup` and `aria-expanded` on that control instead of the wrapper (issue 840).
