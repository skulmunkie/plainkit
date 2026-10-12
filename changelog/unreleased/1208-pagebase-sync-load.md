---
type: fixed
issue: 1208
---
A `PageBase` page whose `OnLoadAsync` completes synchronously now re-renders when the load ends, so it no longer stays blank in an interactive circuit.
