---
type: changed
issue: 358
---
`mountScorecard` takes an optional `signal`: when it aborts the card is destroyed and a run in flight stops opening frames. The scorecard module of the site app passes its route signal, so leaving #/scorecard mid-run stops the work.
