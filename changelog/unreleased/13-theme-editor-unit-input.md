---
type: changed
issue: 13
---
The theme editor edits lengths (spacing, radius and other size tokens with a plain px, rem, em or % value) with a number and a unit field (`pk-unit-input`) instead of a text field; a unit pick applies at once, and other kinds of token keep their fields. The exported CSS is unchanged for unchanged values.
