---
type: fixed
issue: 98
---
`pk-switch` captures the state a form reset returns to once, like the other form elements: moving a toggled switch in the DOM (disconnect and connect) no longer makes a later form reset restore the toggled state.
