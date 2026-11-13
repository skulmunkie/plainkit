---
type: fixed
issue: 1980
---
pk-toc, pk-chart, pk-accordion-item and pk-settings-page no longer reuse the base class private fields $q and $r, which could suppress a render or ignore an attribute change; a new test guards against it.
