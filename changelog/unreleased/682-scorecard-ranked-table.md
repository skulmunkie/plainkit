---
type: breaking
issue: 682
---
The scorecard module draws with SDK elements and no longer ships a stylesheet, and its exported helpers `rankedTable` and `fmtDelta` now take the document first and return DOM nodes (a data-driven `pk-table`; the change as a `pk-text`) instead of HTML strings; `tone` returns a `pk-text` tone name (`positive`, `warning`, `critical`). A host page that put the old strings into `innerHTML` appends the returned node instead: `el.append(rankedTable(document, items, opts))`.
