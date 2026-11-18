---
type: added
issue: 2011
---
pk-wizard-page config.liveValidate runs validate(stepId, values, { live, key }) when an answer is committed, marking the field at once without Next, and the named controls of slotted steps (slot="step-<id>") are now collected into the answers and validated. refresh() re-runs load() for a resumed draft.
