---
type: added
issue: 23
---
An element's meta can mark itself, a prop, an event or a slot `deprecated: { since, remove, message }`. The generated module then logs one warning per page through the element's logger when the item is used (an attribute or property set, a listener added, a slot filled, the tag connected), the skills reference lists what is deprecated and what to use instead, and `versioning.mjs check` fails when an item the last release announced is removed before its `remove` version. An element that deprecates nothing loads no extra code.
