---
type: added
issue: 1295
---
The dashboard page starts a widget when its card scrolls near the viewport (an IntersectionObserver with a 200px margin) instead of all at once when its tab opens: widgets above the fold start at once, lower ones when scrolled to, a tab switch drops starts still waiting, cards keep their reserved height so nothing shifts, and the observer is disconnected when the page leaves. Closes #1295.
