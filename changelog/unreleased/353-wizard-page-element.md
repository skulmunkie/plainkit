---
type: added
issue: 353
---
`pk-wizard-page` and the `'wizard'` app-framework page type: a multi-step flow with a `pk-stepper`, one validated form per step, Back, Next and Submit, and an optional Review step. Your `validate(stepId, values)`, `submit(values)`, `load()` and `mountStep(pane, step)` callbacks do the work; Next is blocked until the step is valid, answers are kept when you go back, server errors land on their fields, and unsent answers (`dirty`, `pk-wizard-dirty`) ask before the tab closes.
