---
type: breaking
issue: 355
---
The Files and Scorecard pages are lazy modules of the site app: open `app.html#/files` (deep link `#/files?path=components/tabs/tabs.js&line=12`) and `app.html#/scorecard`. The old standalone addresses `site/files/index.html` and `site/scorecard/index.html` are gone, with no redirect.
