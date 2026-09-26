---
type: added
issue: 348
---
`js/store.js` adds `createStore({ prefix, version })`: per-module state that is namespaced (`<prefix>.<module>`), versioned (`{ v, data }` with `migrate`), validated against a small JSON schema (type, enum, range, length), subscribable (unsubscribe functions, `listeners()`, `destroy()`) and optionally persisted; corrupt, oversized, old or foreign saved data falls back to the defaults with one logged warning, and modules read only each other's `publish` keys, read-only. `js/store-extras.js` adds the opt-in `withLegacy` (reads today's plain keys once) and `syncTabs` (cross-tab sync from `storage` events, no polling); `js/settings.js` holds `readSetting` and `writeSetting`, moved from the gallery site, which re-exports them.
