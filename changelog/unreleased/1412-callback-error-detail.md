---
type: fixed
issue: 1412
---
Security: a page callback that throws in C# (a dashboard widget load, a list load, a record, doc, settings, wizard or tool page callback) no longer puts its exception text, stack trace or file paths in the page error state, whichever way the host reports errors (DetailedErrors, WebAssembly). An exception that implements `IPkUserFacingException` keeps its own message; any other exception shows "Something went wrong. See the log for details." and the browser (and the SDK log) gets only its exception type name, while the full exception is written to `ILogger` on the server.
