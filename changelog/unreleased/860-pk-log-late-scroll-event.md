---
type: fixed
issue: 860
---
`pk-log` no longer treats the scroll event of its own jump to the bottom as the reader scrolling: a log the host pauses just after a jump stays paused and raises no stray `pk-pause`.
