## Release X.Y.Z

<!-- Use with ?template=release.md when opening the pull request. Procedure: CONTRIBUTING.md, "Versioning and releases". -->

**Version:** `core/VERSION` = `X.Y.Z` (previous release: `A.B.C`)
**API changes since the previous release:** <!-- paste the output of: node core/tools/versioning.mjs bump -->

## Checklist

- [ ] `node core/tools/versioning.mjs set X.Y.Z`, then `node scripts/bootstrap.mjs` passes (the stamp reaches the generated `dist`, the skills and the package copy; none of it is committed)
- [ ] `node scripts/changelog.mjs compile --version X.Y.Z`: the fragments in `changelog/unreleased/` are now a dated section of `CHANGELOG.md` (breaking changes under `### Breaking`), the folder is empty, "Unreleased" is empty
- [ ] Last: `node core/tools/api-surface.mjs --write --release X.Y.Z` (the API baseline describes this release)
- [ ] `node scripts/size-trend.mjs --append`: one entry for X.Y.Z in `core/tests/size-history.json` (add `--payload` when the .NET SDK is available); paste the table it prints below. A metric more than 15 percent above the 0.30.0 baseline needs the owner's acknowledgement line in that entry (`acknowledged`); a metric more than 5 percent over the previous release is a warning to look at
- [ ] CI is green, including "Release pull request checks" (`check --release` and `bump --require`)
- [ ] Node tests, `dotnet test PlainKit.slnx`, and the browser attestation are current
- [ ] The issues this release finishes are closed (`Closes #n` below)

Closes #

## After merging

1. The owner tags the merge commit `vX.Y.Z` (equal to `core/VERSION`) and pushes the tag: `git tag vX.Y.Z && git push origin vX.Y.Z`. Merging alone publishes nothing.
2. `release.yml` checks the tag equals `core/VERSION`, then publishes to NuGet, attaches the zip, manifest and `.nupkg` to a GitHub release (a pre-release when the version has a `-`), and publishes to npm only if `NPM_TOKEN` is set.
