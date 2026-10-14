---
type: fixed
issue: 1329
---
List and record pages in Blazor load again: the JavaScript bridge now passes both arguments to the callback host, so the call no longer throws "expects 2 parameters, but received 1".
