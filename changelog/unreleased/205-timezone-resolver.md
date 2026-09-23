---
type: added
issue: 205
---
`IPkTimeZoneResolver` (registered by `AddPlainKit`) resolves the app's configured display timezone (`PkOptions.TimeZone`: an IANA id, a Windows id and DST-fallback rule data) once and converts timestamps into it, so rendered wall-clock times stay in one fixed organizational zone regardless of the host's own OS timezone. The IANA id is tried first, then the Windows id, then a synthetic zone built from the supplied rules, so a trimmed or globalization-invariant deployment degrades instead of throwing; `Resolution.Source` reports which path was taken (and a Windows or fallback resolution is logged as a warning), and `ToConfiguredZone` treats `DateTimeKind.Unspecified` as UTC.
