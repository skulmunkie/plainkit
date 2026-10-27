---
type: added
issue: 1822
---
`pk-app-bar-search` (`PkAppBarSearch`) announces the result count to assistive technology: while the results panel is open, a visually hidden polite live region (part `status`) reads "N results", the no-results text or the error text after each update. The new `resultsLabel` property (`ResultsLabel`, default "results") is the word after the count, so it can be localised.
