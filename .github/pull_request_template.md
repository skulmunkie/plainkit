## What and why

<!-- One or two sentences. Say how you verified it. -->

## Issues

<!-- One issue per pull request. Each on its own line: GitHub closes only the first issue of a list. `Refs #n` for an issue it only advances. -->
Closes #

## Checklist

- [ ] One issue, one pull request; about 400 lines of hand-written source or fewer (generated files do not count)
- [ ] Changelog fragment added (`node scripts/changelog.mjs new <type> <slug> --issue N`), or the label `no-changelog` with the reason here: <!-- reason -->
- [ ] Tests added or updated; `node --test "core/tests/*.test.mjs" "core/elements/*/*.test.mjs" "core/modules/*/*.test.mjs" "scripts/tests/*.test.mjs"` and `dotnet test PlainKit.slnx` pass
- [ ] Generated output regenerated, in order (a later phase moves this to CI): `node core/tools/build.mjs`, `node scripts/generate-blazor.mjs`, `node scripts/build-skills.mjs`, `node scripts/publish-dist.mjs`
- [ ] Skills (`scripts/skills/`, then regenerated) and docs updated in this pull request; SDK and Blazor changed together where they are linked
- [ ] The issue has a comment saying what changed and what remains, and its checklist items are ticked (the owner closes issues)
- [ ] Ownership and reactivity rules respected (`core/STANDARDS.md`); only existing components used
- [ ] No size budget raised
- [ ] Element sources or browser cases changed: the browser attestation was re-run (`core/tests/browser/report.json`)
