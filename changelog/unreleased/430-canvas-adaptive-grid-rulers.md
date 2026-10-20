---
type: added
issue: 430
---
`pk-canvas` gains an adaptive grid and rulers: `auto-grid` draws lines at the 1, 2, 5, 10, 20, 50 ... step that stays 8 to 20 px apart at every zoom (a stronger line every fifth step or more, `--pk-canvas-grid-major`), `unit` (`none`, `px`, `mm`, `in`, `pt`) with `px-per-unit` sets the unit of the grid and the labels, and `rulers` adds labelled rulers along the top and left with a pointer readout; the rulers are a separate module loaded on first use, hidden on a phone, and never change the stored world numbers (Blazor `AutoGrid`, `Unit`, `PxPerUnit`, `Rulers`). `js/viewport-logic.js` gains `gridSteps`. Fixed (#1660): in a right-to-left page the canvas world and its selection marks no longer mirror; they sit where the view says, like the world coordinates.
