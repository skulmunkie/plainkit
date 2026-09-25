---
type: fixed
issue: 284
---
`pk-app-bar-search` is a pill again, not an oval, and fills the space its header row gives it (up to 34rem, or the new `--pk-app-bar-search-width`) instead of a fixed 14rem, so the placeholder is no longer cut off. The SDK site header search is now this element (a pill, an icon button on a phone) instead of its own hand-built field.
