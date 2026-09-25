## What and why

<!-- One or two sentences. Say how you verified it. -->

## Issues

<!-- One issue per pull request. Each on its own line: GitHub closes only the first issue of a list. `Refs #n` for an issue it only advances. -->
Closes #

## Checklist

- [ ] One issue, one pull request; about 400 lines of hand-written source or fewer (generated files do not count)
- [ ] Changelog fragment added (`node scripts/changelog.mjs new <type> <slug> --issue N`), or the label `no-changelog` with the reason here: <!-- reason -->
- [ ] Tests added or updated; `node scripts/verify.mjs` passes (the node tests, `dotnet test PlainKit.slnx` and every other check CI runs; `--fast` while iterating)
- [ ] No generated file is committed (`node scripts/verify.mjs` checks it, after the bootstrap)
- [ ] Skills (`scripts/skills/`) and docs updated in this pull request; SDK and Blazor changed together where they are linked
- [ ] The issue has a comment saying what changed and what remains, and its checklist items are ticked (a merged `Closes #n` closes the issue; use `Refs #n` when it only advances it)
- [ ] Ownership and reactivity rules respected (`core/STANDARDS.md`); only existing components used
- [ ] No size budget raised
- [ ] Changes how an element looks (CSS, templates, layout, tokens, razor markup): review screenshots attached (`node scripts/ui-review.mjs`: desktop 1280 and phone 375, light and dark, plus the scenario for the state that changed), audit and scenario errors fixed, every layout expectation of the issue is a measuring browser case, and it is **not** merged on green CI alone: the owner (or the orchestrating agent, after looking) checks the screenshots against the issue first
- [ ] Element sources or browser cases changed: the browser attestation was re-run (`core/tests/browser/report.json`)
