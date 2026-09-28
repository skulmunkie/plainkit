---
type: added
issue: 394
---
`js/measure.js` is a public utility any app can use to measure its own pages: `measurePage(url)` loads a same-origin page in an off-screen iframe and reports load time, DOM size, largest paint, layout shift (CLS), long tasks and slowest interaction; `watchVitals` and `recalcMs` are the parts the SDK scorecard already used, now shared.
