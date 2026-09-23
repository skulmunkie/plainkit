---
type: added
issue: 205
---
New `PkDisplayTimeZone` (PlainKit.Blazor): a fixed, configured display time zone for an app that always renders wall-clock timestamps in one organization zone, regardless of the host's own. Resolves the zone by its IANA id, then its Windows id, then a caller-supplied `TimeZoneInfo` or UTC when neither system id resolves (the case a trimmed or globalization-invariant deploy can hit); `Resolution` exposes which of the three happened, so a misconfigured host is diagnosable rather than silently wrong. `ToDisplay` treats an `Unspecified` `DateTime.Kind` as UTC. Register it once (`services.AddSingleton(...)`); it needs no `AddPlainKit`.
