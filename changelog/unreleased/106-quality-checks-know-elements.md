---
type: fixed
issue: 106
---
The SDK quality checks (`js/quality.js`, the scorecard, the dev tools Quality tab) no longer report what is right by design in the `pk-*` elements: rows that are flush by design (`pk-tree`, `pk-side-nav`, `pk-list-group`, `pk-timeline`, `pk-stepper`, `pk-field-list`) are not "unspaced", an element whose label is drawn in its shadow tree (a tree row, a step) has an accessible name, a host whose padding lives in its shadow parts is not "text at the edge", inline links and tab panels are not phone touch targets, and a `display: contents` element with visible content (`pk-lightbox`, `pk-back-to-top`) is not an empty preview. `hasBox` and `touchExempt` are new exports. The scorecard page's workspace-fill check measures the footer strip the slotted footer spans sit in, not the first span.
