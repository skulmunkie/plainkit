---
type: added
issue: 431
---
The SVG toolkit can align and distribute (`js/svg/align.js`, pure, no element yet): `alignPlan` lines nodes up on their start, centre or end (within the selection or the page), `distributePlan` gives three or more nodes equal gaps or equal centre distances, and `applyPlan` applies a plan as one undo step, moving a node inside a transformed group by the right amount on the page. Plans are plain `{ id, dx, dy }` lists, so an editor can preview them.
