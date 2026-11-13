---
type: fixed
issue: 1972
---
A Blazor Server circuit that closes while a Pk element is running its first-render initialisation no longer logs an unhandled JSDisconnectedException; a disconnect or cancelled call during init is ignored, and any other JavaScript error still surfaces.
