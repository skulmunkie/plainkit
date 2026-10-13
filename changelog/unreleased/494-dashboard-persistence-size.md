---
type: added
issue: 494
---
A dashboard composed from modules keeps the open tab in the address (`?tab=`, no history entry), saves filter selections in the owning module's `state` when its defaults name the filter key, withdraws a widget whose module's own `can` denies once it has loaded, and draws a contribution's `size` hint (`md` spans two columns and `lg` the whole row from a tablet width up, one column on a phone). `pk-dashboard-page` gains the config keys `tab` and `values`, a widget `size`, and a `load(key)` that resolves `null` to hide that card. A failed widget card now says the widget could not be loaded (Refs #494).
