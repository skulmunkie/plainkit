---
type: added
issue: 124
---
The theme editor's Custom SDK tab has a breakpoint ruler: add breakpoints of your own from device presets or by hand, rename and remove them, and the export carries `plainkit-breakpoints.css` with `data-show-above="name"` and `data-hide-above="name"` for each, beside the SDK's three. Every rewrite of the shipped source now has to find its target exactly the expected number of times, or the export fails with a message instead of producing a wrong build.
