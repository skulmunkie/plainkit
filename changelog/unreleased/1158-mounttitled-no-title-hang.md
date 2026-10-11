---
type: fixed
issue: 1158
---
A page type mounted without a title (a master-detail or workspace page with no heading) now finishes mounting; it no longer waits for the heading element, which nothing loads when there is no title.
