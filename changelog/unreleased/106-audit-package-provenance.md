---
type: changed
issue: 106
---
The `PlainKit.Blazor` package records the repository and the exact commit it was built from in its nuspec (SourceLink metadata), and a build on GitHub Actions is deterministic, so the same commit gives the same assembly.
