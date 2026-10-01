---
type: changed
issue: 750
---
The UI review renders gallery examples about twice as fast: it no longer sleeps a fixed 100 ms before and 150 ms after each page, and settles each example by waiting for the page's short timers instead of a fixed idle time. A 24-element sample went from 91 s to 47 s with byte-identical screenshots.
