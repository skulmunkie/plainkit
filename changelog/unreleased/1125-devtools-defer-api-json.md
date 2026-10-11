---
type: changed
issue: 1125
---
The dev tools no longer fetch the 120 KB `elements/api.json` while they start. The Layout builder tab is built when it first opens, and the console's Events tab records the built-in event list from the start and adds the rest of the element events when the tab first opens; the file is fetched once and shared.
