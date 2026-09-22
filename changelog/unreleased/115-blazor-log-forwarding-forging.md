---
type: fixed
issue: 115
---
`PlainKit.Blazor`'s browser-to-`ILogger` forwarding (`PkOptions.Logging.ForwardToILogger`) no longer trusts what the browser sends: every forwarded
entry is written under the fixed category `PlainKit.Browser` instead of a scope the client picked, control characters (CR/LF, ANSI escapes) in the
scope, message and detail are stripped so a client cannot forge extra log lines, each is capped in length, and calls are rate-limited per circuit
(50 per second, with the number dropped logged once the window closes) so a flood cannot fill the server log.
