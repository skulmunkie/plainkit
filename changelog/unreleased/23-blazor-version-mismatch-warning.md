---
type: added
issue: 23
---
PlainKit.Blazor logs one warning per runtime, at startup, when the Plainkit JavaScript the page loaded is a different version from the package (`PkRuntime.GetSdkVersionAsync` against `PkAssets.Version`): to `ILogger` (category `PlainKit.blazor`) and to the SDK log, so the Logs tab shows it. A failing check never breaks startup.
