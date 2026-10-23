---
type: changed
issue: 1714
---
The Blazor reconnect banner no longer covers the app bar on a desktop: it reserves its own height at the top (the app frame gives that height up and the page does not scroll), stays a layer over the content on a phone, and its buttons show icon plus text on a desktop and only the icon (with the text as the accessible name) on a phone. The Blazor browser harness can now restart the sample host, and cases cover the session-ended countdown, the automatic reload onto a fresh circuit and the loop guard.
