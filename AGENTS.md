# Agents working on Plainkit

This file is for developer agents changing this repository. (Agents *using* Plainkit in another project want the skills, generated into `core/dist/skills/` by
the bootstrap or taken from a release; see the README, "Using the skills with an agent".) People: `CONTRIBUTING.md` is the same flow with the reasons.

Read first: `CONTRIBUTING.md`, `core/STANDARDS.md` (especially "Ownership and reactivity"), and the issue you were given.

## The flow

- **Trunk-based.** `main` is always releasable. Work happens on short-lived branches and lands through pull requests.
- **One issue = one branch = one pull request.** Branch `agent/<issue>-<slug>` (for example `agent/52-tabs-arrow-keys`), from the latest `main`
  (`git fetch origin && git switch -c agent/52-tabs-arrow-keys origin/main`). Before you finish, merge or rebase `origin/main` again and re-run
  the definition of done. No issue for the work? Ask; do not invent scope.
- **Small.** Aim for about 400 lines of hand-written source per pull request; generated files do not count. If it will be bigger, split the
  issue into steps that each leave `main` releasable, and say so on the issue.
- **Scope.** Only what the issue asks. Note anything else you find on the issue (or open a new one); do not fix it in this pull request.
- **Merging** follows the repository rules (required checks, no bypass); never merge around a failing check.

## Definition of done

Run these from the repository root, in this order. The first produces every generated file (they are not in git); the rest are the checks CI runs:

```
node scripts/bootstrap.mjs
node core/tools/versioning.mjs check
node --test "core/tests/*.test.mjs" "core/elements/*/*.test.mjs" "core/modules/*/*.test.mjs" "scripts/tests/*.test.mjs"
dotnet test PlainKit.slnx --configuration Release
node scripts/changelog.mjs check
node scripts/generated.mjs check
```

On a fresh clone, after switching branches and after editing any source, run `node scripts/bootstrap.mjs` first (about 4 seconds). `dotnet build` refuses to run without it,
and a test that reads a generated file says so. **Never commit generated files**: they are gitignored, and `node scripts/generated.mjs check` fails if one is tracked.

Also part of done, in the same pull request (owner directive): the **agent skills and documentation** describe the change (a new prop, element,
option or workflow appears in the docs, the gallery samples and the skills' workflows in `scripts/skills/`), the SDK and Blazor change together
(an element change updates `blazor/mappings/<name>.json`), and a **changelog fragment** is added.

### Browser attestation

Required when an element source or a browser case changed (`core/elements/**`, `core/js/**`, `core/tests/browser/**`): the in-browser suite must be
re-run so `core/tests/browser/report.json` is current. `node core/tools/serve.mjs 5341 --write-reports`, open `http://localhost:5341/tests/browser/`
in a visible tab at desktop size, wait for "report saved", stop the server, commit the report. If `scripts/attest-browser.mjs` exists on your base, use it instead
(read its header). Do not edit the report by hand, and if a case fails, fix the cause; never weaken the case.

## Generated files: not in git, never hand-edit

About 40% of what the build touches is generated, and none of it is committed: `core/dist/**` (including `core/dist/skills/` and the manifests), `blazor/src/PlainKit.Blazor/wwwroot/plainkit/**`,
`blazor/src/PlainKit.Blazor/Generated/**`, `wwwroot/PlainKit.Blazor.lib.module.js`, `core/site/files/snapshot.json`, `core/site/gallery/gallery.data.js`, `core/elements/*/*.element.js`,
`core/elements/elements.css`, `core/elements/registry.js`, `core/plainkit.css`, `core/js/version.js` and `core/site/scorecard/api.current.json` (the exact list: `node scripts/generated.mjs list`, and
the section "Generated output" of `.gitignore`). `node scripts/bootstrap.mjs` writes them; change the source and run it again.

Still committed, because they are release artefacts and not build output: `core/VERSION`, `core/site/scorecard/api.baseline.json` (refreshed only in a release pull request) and
`core/tests/browser/report.json` (the browser attestation, below).

**Expect no conflicts in generated files any more**: there is nothing to conflict. A conflict in a source file is resolved like any other; then re-run the bootstrap.
`CHANGELOG.md` conflicts should not happen either: you do not edit it (below).

## Changelog fragments

Do not edit `CHANGELOG.md`. Add one file per change: `node scripts/changelog.mjs new <added|changed|fixed|removed|breaking|notes> <slug> --issue N`,
then write the entry (format: `changelog/README.md`). A pull request that changes only docs (`*.md`, `changelog/**`) needs none; a change with no
visible effect (tooling, refactor) uses the label `no-changelog` and says why in the description. The release pull request compiles the fragments.

## Rules that are easy to break

- **Ownership and reactivity:** `core/STANDARDS.md`, "Ownership and reactivity". The host owns attributes and light-DOM children, the element owns
  its shadow tree, subscriptions outside the element's subtree are added in `connected()` and removed in `disconnected()`, no new base-class hooks.
  `core/tests/ownership.test.mjs` and `core/tests/element-surface.test.mjs` enforce it; do not edit them to make your change pass.
- **Line endings.** Tracked files under `core/`, `blazor/mappings/` and `blazor/src/PlainKit.Blazor/wwwroot/` are CRLF (`.gitattributes`); the build writes CRLF for
  the generated files and tests compare bytes. Do not rewrite a whole file with a tool that strips carriage returns; check `git diff --stat` for whole-file diffs.
- **CSP.** The site runs under `script-src 'self'; style-src 'self'`: no inline scripts, `style` attributes, `<style>` elements, inline handlers, `eval` or
  cross-origin requests. `innerHTML`-style sinks are counted in `core/tools/security.allow.json`; prefer DOM APIs and `textContent`.
- **Tokens only.** No literal colours or ad-hoc sizes in CSS; use the tokens (`--color-*`, `--space-*`, `--text-*`, `--radius-*`, `--shadow-*`), and an
  element's own hooks are `--pk-<element>-<part>`. Tokens live only in `tokens/tokens.css`.
- **Size budgets are never raised.** Not the page layer's 10 KB gzip, not an element's. If you are over, make the source smaller.
- **No silent failure.** No empty `catch`, no `.catch(() => {})`, no bare `console.*`: use the SDK logger (`createLogger(scope)` from `js/log.js`; elements have
  `this.log` and `this.warnOnce`). `core/tests/no-silent-catch.test.mjs` checks.
- **Only existing components.** Use the `pk-*` elements that exist; a gap is recorded in the "components the SDK lacks" issue, not invented locally.
- **Privacy.** No personal paths, real email addresses or internal tracker references anywhere (`core/tests/privacy.test.mjs`).

## Commits, pull requests, issues

- Commit messages: a short imperative subject and a body saying why. End with the attribution the tool gives you (the `Co-Authored-By` line); do the
  same in the pull request description when the tool gives one. Do not invent your own.
- Pull request: use `.github/pull_request_template.md`. One `Closes #n` per issue, each on its own line (GitHub closes only the first of a list); `Refs #n` for
  issues it only advances. The description says what changed and why, and how you verified it.
- **Issue hygiene.** Comment on the issue with what changed and what remains, and tick the checklist items the pull request completes. **Do not close
  issues**: the owner closes them.

## Releases

- **Packages are published only from a version tag.** Merging to `main` never publishes anything. CI may build and pack for verification but never pushes to a registry.
- A release goes through a release pull request (`release/X.Y.Z`, template `release.md`): `core/VERSION` set, the changelog compiled
  (`node scripts/changelog.mjs compile --version X.Y.Z`), the API baseline refreshed. The tag `vX.Y.Z` must equal `core/VERSION`; `release.yml` refuses otherwise.
- **Cadence:** a release is cut when a batch of finished issues is worth shipping, not on a schedule. nuget.org versions cannot be deleted, only unlisted,
  so publish less often, not more.
- Details: `CONTRIBUTING.md` ("Versioning and releases") and `PUBLISHING.md`.

## Never, without the owner

Push tags (a tag publishes), publish to any registry, change repository settings (branch protection, merge settings, secrets, Pages),
close issues, force-push (to any shared branch), delete branches you did not create. If the task seems to need one of these,
stop and say so on the issue or in your report.
