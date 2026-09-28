---
type: fixed
issue: 479
---
The scorecard waits for elements that page types create after they are defined before it measures a sample, so a slow machine no longer reads them as an empty preview or an undersized button. `pk-doc-page` takes `config.level` (1 to 3, default 1) for its title heading, and its gallery example uses 2 so the gallery page keeps a single h1.
