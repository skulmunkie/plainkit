---
type: fixed
issue: 1798
---
A search pk-input (`PkInput` with `SearchOn=Enter`) now raises pk-search with an empty value when the browser's own clear (x) button, or deleting every character, empties the box; before, only the element's clear button and Escape did, so a lookup matched on Enter could not react to that clear.
