---
type: fixed
issue: 358
---
The scorecard page no longer shifts while its cards fill in: each card's elements load before the cards are added, so the page appears once at its final height (layout shift 0.13 to 0.18 before, under 0.02 after).
