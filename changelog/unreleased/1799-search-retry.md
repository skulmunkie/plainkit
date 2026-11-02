---
type: added
issue: 1799
---
A failed header search shows a Retry button under its error message (`pk-app-bar-search` and `pk-app-frame`). Pressing it raises `pk-retry` and raises `pk-query` again for the text in the field; `retryLabel` localises the button, and Blazor gets `OnRetry` and `RetryLabel`.
