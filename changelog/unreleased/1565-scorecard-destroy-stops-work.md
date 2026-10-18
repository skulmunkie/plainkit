---
type: fixed
issue: 1565
---
A scorecard that is closed (its module left, or the card destroyed) stops reading and compressing the element files for its size section and paints nothing, instead of finishing that work in the background and starving the page for seconds.
