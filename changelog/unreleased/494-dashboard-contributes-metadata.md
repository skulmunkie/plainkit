---
type: added
issue: 494
---
A module entry in the app config accepts a `contributes` list of dashboard widget metadata (key, `for`, tab, label, kind, size, order, needs, can), checked as an array at `mountApp`; the pure composer behind it is not wired into the dashboard page yet, so nothing changes on screen.
