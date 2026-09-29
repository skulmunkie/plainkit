---
type: fixed
issue: 518
---
The `plainkit audit` CLI no longer ships inside the PlainKit.Blazor NuGet package: it is a Node program meant to run through `npx plainkit audit`, and the package check (`scripts/check-package.mjs`) now asserts both that the CLI is present in the npm package and absent from the NuGet one.
