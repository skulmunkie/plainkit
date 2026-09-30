---
type: fixed
issue: 697
---
The conformance audit's S-family rules (S2, S3, S5, S6, S7, S8) no longer flag prose inside a JS `//` or `/* */` comment as if it were real code - a doc comment mentioning `localStorage` or `document.` no longer trips S7.
