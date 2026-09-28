---
type: fixed
issue: 549
---
The SDK Scorecard waits for elements inside open shadow roots to be defined before it measures a preview, so a busy machine no longer reads `pk-master-detail-page` (whose `pk-list-page` lives in its shadow tree) as an empty preview.
