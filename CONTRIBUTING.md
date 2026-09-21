# Contributing

Work on Plainkit is tracked in GitHub Issues and closed through pull requests. Nothing is "done" until the issue that describes it is
closed by a merged pull request.

## The flow

1. **Every piece of work has an issue.** Search the open issues first; if there is none, open one with a checklist of what "done" means.
   Big efforts get a `tracking` issue whose checklist links the smaller issues (`- [ ] #16`), so progress shows as they close.
2. **Labels.** `core` (the vanilla toolkit), `blazor` (PlainKit.Blazor and the bridge), `release`, `documentation`, `accessibility`, `bug`,
   `enhancement`, and `tracking` for umbrella issues.
3. **Work on a branch and open a pull request.** Reference the issue in the description with a closing keyword when the pull request
   finishes it (`Closes #12`) and with `Refs #1` when it only advances it. Commits can carry `Refs #n` too.
4. **Tick the checklist as parts land.** Edit the issue when a box is done on the branch; the pull request description says which boxes.
   Leave the issue open until every box is ticked, or split the leftovers into a new issue and close the original.
5. **Merging closes.** A merged pull request with `Closes #n` closes the issue. Do not close an issue by hand unless it was decided against
   (then close it as "not planned" with a comment saying why).

## Definition of done

A change is done when, on its pull request:

- `node --test "core/tests/*.test.mjs" "core/elements/*/*.test.mjs" "core/modules/*/*.test.mjs"` passes, and `dotnet test PlainKit.slnx` passes.
- `node core/tools/build.mjs` has been run, so `core/dist` is current, and `node scripts/publish-dist.mjs` has copied it into the Blazor package (CI checks both).
- If an element source or a browser case changed, the in-browser suite was re-run so `core/tests/browser/report.json` is current (`node core/tools/serve.mjs 5341 --write-reports`, open `/tests/browser/` in a visible tab at desktop size, wait for "report saved").
- SDK and Blazor changes ship together: an element change updates its `blazor` metadata and, once generated, its wrapper.
- It uses only components that exist in `core`; a missing component is recorded in the "components the SDK lacks" issue instead of being invented locally.
- No internal tracker references, personal paths or real email addresses (`core/tests/privacy.test.mjs` checks).

## Releases

A release is a tag (`v0.1.0`). See `PUBLISHING.md`. The release notes are generated from the merged pull requests, so titles and descriptions
should say what changed.
