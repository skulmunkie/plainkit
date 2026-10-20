---
type: changed
issue: 432
---
pk-dock loads its persistence store and its controlled-mode (confirmLayout) round trip from a shared module instead of its own element file, so the element is about 8 percent smaller (3.63 KB gzip) with no change in behaviour.
