---
type: added
issue: 364
---
`blazor/samples/PlainKit.AppSample` is a working Blazor app on the app framework: Overview, Orders (a list route and a record route) and Reports modules whose manifests are the same JSON as the SDK demo app (`core/samples/app/manifests`), a module guard, an error boundary and an `[Authorize]` page. Tests assert the manifests match the SDK's byte for byte, that every manifest route has an `@page` (and the reverse), and that mounting and disposing `PkApp` 100 times leaves no handler behind.
