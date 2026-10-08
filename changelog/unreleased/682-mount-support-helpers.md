---
type: added
issue: 682
---
`mount-support` has small helpers for a module that must stay free of raw browser calls: `later(win, fn, ms)` and `every(win, fn, ms)` (each returns the function that stops it), `storedText(win, key)` and `storeText(win, key, text)` for local storage, `addressOf(win)` for the page address and hash, and `loadText(url, fetch?)` beside the existing `loadJson`.
