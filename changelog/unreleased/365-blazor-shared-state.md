---
type: added
issue: 365
---
PlainKit.Blazor registers IPkStore, IPkSettings and IPkTheme in AddPlainKit(): module-namespaced, versioned, validated per-viewer state in browser storage (the same {v, data} envelope and pk.<module> keys as the JavaScript store, so both read each other's data), typed settings by module, and a persisted light/dark theme with change notification. Corrupt, foreign or other-version stored data gives the defaults and a logged warning; storage that is unavailable keeps the state in memory.
