---
type: fixed
issue: 1813
---
The base stylesheet no longer adds the small top margin to the items of a list marked `role="list"`, so a `ul`/`ol` laid out as a row or grid (a nav bar, chips, pagination, a card grid) keeps its items on one line. Prose lists without the role keep their item spacing.
