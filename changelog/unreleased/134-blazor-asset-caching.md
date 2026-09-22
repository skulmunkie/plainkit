---
type: fixed
issue: 134
---
`PkStyles` and the JavaScript bridge `PkRuntime` loads now use ASP.NET Core's static asset fingerprinting when the host calls `app.MapStaticAssets()` (the default since ASP.NET Core 9): the stylesheet and the bridge get a content-hashed filename served with `Cache-Control: public, max-age=31536000, immutable`, so a warm visit no longer revalidates either of them. Pass a component's own `Assets` into `PkRuntime.EnsureInitializedAsync`/`BridgeAsync` (every generated `pk-*` component and the dev tools already do) to get the fingerprinted bridge URL; without one, both still fall back to the previous `?v=` content-hash query, which is always revalidated.
