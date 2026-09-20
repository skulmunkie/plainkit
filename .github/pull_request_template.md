## What and why

<!-- One or two sentences. -->

## Issues

<!-- `Closes #n` for each issue this finishes (it closes on merge); `Refs #n` for issues it only advances. -->
Closes #
Refs #

## Checklist

- [ ] Node tests and `dotnet test PlainKit.slnx` pass
- [ ] `node core/tools/build.mjs` run, `node scripts/publish-dist.mjs` run (CI checks both)
- [ ] Element sources or browser cases changed: the browser attestation was re-run (`core/tests/browser/report.json`)
- [ ] Issue checklists ticked for what this PR completes
- [ ] SDK and Blazor changed together where they are linked
- [ ] Only existing components used (gaps recorded in the missing-components issue)
