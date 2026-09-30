---
type: added
issue: 736
---
Every element meta now declares a required `tier` (element, component, page or shell), page-tier elements name their `core/js/app/pages` factory with `pageType`, and two new checks (dependency direction and one element per page factory) fail on new debt against `core/tools/tiers.baseline.json`.
