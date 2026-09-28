---
type: changed
issue: 513
---
Failures the SDK used to swallow (a blocked clipboard in the dev console's Copy as JSON, blocked storage, a refused pointer capture, a throwing log output) are now logged, at warn or debug level, and the Copy button says when the browser blocked it.
