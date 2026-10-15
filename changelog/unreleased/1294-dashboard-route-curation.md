---
type: added
issue: 1294
---
A dashboard route with a `surface` can curate what modules contribute: `order`, `allow` and `deny` take `module:key` ids (order lists first, allow keeps, deny drops and wins); an id nothing offers warns once, a malformed list throws, and a widget's `can` still applies. The demo Orders summary route lists Revenue first.
