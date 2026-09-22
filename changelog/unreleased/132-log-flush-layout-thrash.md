---
type: fixed
issue: 132
---
`pk-log` no longer forces a layout of the whole list on every `append()` flush: the scroll-to-bottom (the part that reads `scrollHeight`) is
coalesced to once per animation frame instead of once per flush, so a stream that appends from separate tasks (a WebSocket message, a SignalR
line) no longer saturates the main thread. Auto-scroll still follows the newest row, still stays put while the reader has scrolled up, and no
longer mistakes its own scroll for the reader's.
