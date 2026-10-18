---
type: fixed
issue: 1586
---
A `PageBase` page rendered statically (SSR or prerender) no longer fails the response when the request scope is disposed before the page: disposing a page reports its busy state through a service resolved once at start, and never touches the service provider.
