---
type: changed
---
The changelog check treats tests like docs: a pull request that changes only tests (`*.test.mjs`, `core/tests/`, `scripts/tests/`, `blazor/tests/`) needs no fragment; a test next to a source change still needs the source's fragment.
