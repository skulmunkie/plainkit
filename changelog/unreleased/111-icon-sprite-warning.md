---
type: changed
issue: 111
---
An icon sprite that cannot be loaded (not found, offline) now logs one warning per page, naming the address and the fix (add the `plainkit.icons` package, or set `<meta name="pk-icons">`); nothing is drawn and icon boxes keep their size, so the layout does not move.
