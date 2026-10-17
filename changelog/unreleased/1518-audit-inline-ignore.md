---
type: added
issue: 1518
---
The conformance audit CLI honours inline `plainkit-audit-ignore RULE -- reason` comments (HTML, `//`, `/* */` and Razor comments): the named rule is suppressed on the comment line and the next, the rule id and a reason are required (a bare ignore fails the run), the summary counts suppressions, and `--list-suppressions` lists them.
