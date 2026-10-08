---
type: changed
issue: 401
---
The Gallery follows its address through the SDK router (hash mode) instead of its own listener: the old addresses (`#/controls/...`, `#/layouts/...`, `#/templates/...`, building blocks) are now rewritten once to the address of the view they show, so the address always names what you see and copying it opens the same view; a scoped mount with no address of its own writes the address of its first view. Deep links, back and forward, and the `?q` and `?p` query of the list views work as before.
