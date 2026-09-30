---
type: changed
issue: 750
---
The UI review scenarios wait for running transitions and animations to finish instead of sleeping a fixed time in six scenarios (tabs, app-shell, app-shell-top, app-footer, table-edit, wizard-page), which cut their combined time from 196 s to 127 s with the same screenshots.
