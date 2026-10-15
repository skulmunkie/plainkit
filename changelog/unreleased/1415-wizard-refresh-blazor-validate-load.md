---
type: added
issue: 1415
---
`pk-wizard-page` has a `refresh()` method that runs `load()` again from the first step, and the Blazor `PkWizardPage` gets `Validate(stepId, values)` and `Load()` parameters (the callback bridge now hands several element arguments to .NET as one named object).
