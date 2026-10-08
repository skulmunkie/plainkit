---
type: fixed
issue: 876
---
`pk-master-detail-page` (focusing the row when going back to the list) and `pk-list-page` no longer throw when their child element has not upgraded yet. The SDK dev server (`core/tools/serve.mjs`) retries a file read that fails for a passing reason (too many open files, a file held for a moment) instead of answering 404, which a browser caches for a failed module import.
