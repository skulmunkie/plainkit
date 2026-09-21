---
type: fixed
issue: 106
---
`PkDevTools` follows `PkOptions.DevTools` (default: Development only) like the `/_plainkit` page does: a dock left in a layout renders nothing and starts nothing in production. The Files tab no longer lists credential files (`appsettings*.json`, `secrets.json`, `launchSettings.json`, `*.secrets.*`, `*credentials*`, `*password*`, `*token*`) or follows symbolic links out of the source root, and the version-mismatch log detail is built with the JSON serializer.
