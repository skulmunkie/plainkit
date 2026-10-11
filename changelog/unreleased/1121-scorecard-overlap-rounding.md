---
type: fixed
issue: 1121
---
The UI review no longer reports two boxes that merely touch as overlapping: positions rounded to 0.1 px made the Scorecard stat row and the note under it look like a 96 px2 overlap on desktop, so a crossing under 0.5 px is now treated as rounding.
