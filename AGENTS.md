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

**One command runs everything CI runs, in the same groups: `node scripts/verify.mjs`** (`--fast` = bootstrap + changelog + node tests for the inner loop, `--no-dotnet` skips the .NET build,
`--browser` and `--pack` add the browser suite and the package check; about a minute in full). Before you finish it must pass. The commands it runs, from the repository root, in this
order (the first produces every generated file, which are not in source control):

```
node scripts/bootstrap.mjs
node core/tools/versioning.mjs check
node --test "core/tests/*.test.mjs" "core/elements/*/*.test.mjs" "core/modules/*/*.test.mjs" "core/icons/*.test.mjs" "scripts/tests/*.test.mjs"
dotnet test PlainKit.slnx --configuration Release
node scripts/changelog.mjs check
node scripts/generated.mjs check
```

On a fresh clone, after switching branches and after editing any source, run `node scripts/bootstrap.mjs` first (about 4 seconds). `dotnet build` refuses to run without it,
and a test that reads a generated file says so. **Never commit generated files**: they are gitignored, and `node scripts/generated.mjs check` fails if one is tracked.

Also part of done, in the same pull request (owner directive): the **agent skills and documentation** describe the change (a new prop, element,
option or workflow appears in the docs, the gallery samples and the skills' workflows in `scripts/skills/`), the SDK and Blazor change together
(an element change updates `blazor/mappings/<name>.json`), and a **changelog fragment** is added.

### Reviewing what it looks like

Green CI does not say a layout looks right (the record header in #311 and a chevron inside a breadcrumb link merged green and were wrong on screen). A change to how an element **looks**
(`core/elements/**/*.css`, `*.html`, the layout or tokens, Blazor razor markup) therefore also needs:

- **Screenshots.** `node scripts/ui-review.mjs` (the elements changed versus `origin/main`; `--elements a,b`, `--all`) renders their gallery examples at desktop 1280 and phone 375, light and dark,
  into `review-output/` (git-ignored) with a `manifest.json` of audit findings (overflow, clipping, overlap, tap targets, contrast, names, decoration inside a link, zero-size media; errors exit 1, each with a `FIX:` line).
  Attach the shots to the pull request (CI also keeps them as the `ui-review` artifact), fix every error, and say why a warning is fine.
- **Not merged on green CI alone.** The owner, or the orchestrating agent after *looking at the screenshots*, checks them against the issue's stated expectations first. The `ui-reviewer` subagent
  (`.claude/agents/ui-reviewer.md`; give it the pull request number or the folder) writes advice on them; it never approves or merges.
- **Every layout expectation in an issue is a measuring browser case** (`core/tests/browser/`): "chips share the crumbs row" is a rect comparison, not a sentence. Write the case before the CSS.

### Browser attestation

Required when an element source or a browser case changed (`core/elements/**`, `core/js/**`, `core/tests/browser/**`): the in-browser suite must be
re-run so `core/tests/browser/report.json` is current. `node core/tools/serve.mjs 5341 --write-reports`, open `http://localhost:5341/tests/browser/`
in a visible tab at desktop size, wait for "report saved", stop the server, commit the report. If `scripts/attest-browser.mjs` exists on your base, use it instead
(read its header). Do not edit the report by hand, and if a case fails, fix the cause; never weaken the case.

## When CI fails

Pull request CI is small parallel jobs that each run one group of `scripts/verify.mjs`, so every failure reproduces on your machine with `node scripts/verify.mjs`
(or one job: `node scripts/verify.mjs --only <lint|node|dotnet|browser|pack>`), and every failing check prints a `FIX:` line. A failed pull request also gets one sticky comment
(marker `<!-- ci-summary -->`) listing the failed checks, their FIX lines and log links.

Rules:

- **Read first**: the sticky comment, then `gh run view <run-id> --log-failed` for the full log. Reproduce locally before changing anything.
- **Fix the root cause.** Never edit a test, weaken a case, raise a size or time budget, or add an allow-list entry to get green. If you believe the test or the budget is wrong, stop and say so on the issue.
- **At most three attempts** (push, look at the result, push) on one failure; after the third, stop and report what you tried and what you saw.
- A failure outside the checks (checkout, setup, runner error, timeout) is usually infrastructure: re-run the failed jobs once (`gh run rerun <run-id> --failed`); if it fails again, report it.
- The browser job is not required and tolerates flakiness on purpose: when its rerun passed the comment says "flaky"; note it on the issue and go on.

<!-- verify-fix-table:start (generated by node scripts/verify.mjs --update-docs; do not edit by hand) -->
| Failing check | Likely cause | Fix |
| --- | --- | --- |
| `bootstrap` (every job) | a generator rejected a source file (the output names the script and the file) | fix the source file it names, then run `node scripts/bootstrap.mjs` |
| `changelog` (job `lint`) | a fragment in `changelog/unreleased/` is malformed or still has its placeholder | fix the fragment the output names (format: `changelog/README.md`), then run `node scripts/changelog.mjs check` |
| `changelog-pr` (job `lint`) | the pull request changes more than docs and adds no changelog fragment | run `node scripts/changelog.mjs new <added\|changed\|fixed\|removed\|breaking\|notes> <slug> --issue N` and write the entry; a change with no visible effect gets the label `no-changelog` and the reason in the description |
| `release-fragments` (job `lint`) | `core/VERSION` changed (a release pull request) but changelog fragments are left | run `node scripts/changelog.mjs compile --version <X.Y.Z>` |
| `version` (job `node`) | `core/VERSION`, `core/package.json` and the stamped files disagree | run `node core/tools/versioning.mjs set <X.Y.Z>` (or restore `core/VERSION`), then `node scripts/bootstrap.mjs` |
| `release-pr` (job `node`) | `core/VERSION` changed but the API baseline was not refreshed, or the version does not cover the API changes | run `node core/tools/versioning.mjs bump` to see the version the API changes need, then `node core/tools/api-surface.mjs --write --release <X.Y.Z>` |
| `generated-tree` (job `node`) | a generated file is tracked by git, or the bootstrap changed a tracked file | run `git rm -r --cached <path>` for each tracked generated path (`node scripts/generated.mjs list` shows them); never commit or hand-edit generated files |
| `node-tests` (job `node`) | a node test failed: the change broke what the test guards | run the failing file alone with `node --test <file>` (its path is in the output), fix the code, not the test; after a source change run `node scripts/bootstrap.mjs` first |
| `dotnet` (job `dotnet`) | a build error, a failing test, or a generated file missing or stale | run `node scripts/bootstrap.mjs`, then `dotnet test PlainKit.slnx --configuration Release` and fix the first error |
| `browser` (job `browser`) | an element case failed in a real browser (or the attestation no longer matches `report.json`) | run `node scripts/attest-browser.mjs`, fix the element (never weaken the case) and commit the refreshed `core/tests/browser/report.json`; a case that passes on a rerun is flaky: note it on the issue |
| `pack` (job `pack`) | the package has `content/` or `contentFiles/` entries, lacks the static web assets or skills, or has the wrong version | run `dotnet pack blazor/src/PlainKit.Blazor -c Release -o <dir>` then `node scripts/check-package.mjs <dir>`, and change `PlainKit.Blazor.csproj` as the message says |
<!-- verify-fix-table:end -->

The table is generated from the `CHECKS` table in `scripts/verify.mjs`, the one place the FIX messages are written (`node scripts/verify.mjs --update-docs` refreshes it;
`scripts/tests/verify.test.mjs` fails when it is out of date).

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
then write the entry (format: `changelog/README.md`). A pull request that changes only docs (`*.md`, `changelog/**`) or only tests (`*.test.mjs`, `core/tests/`, `scripts/tests/`, `blazor/tests/`) needs none; a change with no
visible effect (tooling, refactor) uses the label `no-changelog` and says why in the description. The release pull request compiles the fragments.

## Rules that are easy to break

- **Ownership and reactivity:** `core/STANDARDS.md`, "Ownership and reactivity". The host owns attributes and light-DOM children, the element owns
  its shadow tree, subscriptions outside the element's subtree are added in `connected()` and removed in `disconnected()`, no new base-class hooks.
  `core/tests/ownership.test.mjs` and `core/tests/element-surface.test.mjs` enforce it; do not edit them to make your change pass.
- **Line endings.** Tracked files under `core/`, `blazor/mappings/` and `blazor/src/PlainKit.Blazor/wwwroot/` are CRLF (`.gitattributes`); the build writes CRLF for
  the generated files and tests compare bytes. Do not rewrite a whole file with a tool that strips carriage returns; check `git diff --stat` for whole-file diffs.
- **CSP.** The site runs under `script-src 'self'; style-src 'self'`: no inline scripts, `style` attributes, `<style>` elements, inline handlers, `eval` or
  cross-origin requests. `innerHTML`-style sinks are counted in `core/tools/security.allow.json`; prefer DOM APIs and `textContent`.
- **Tokens only.** No literal colours or ad-hoc sizes in CSS; use the tokens (`--color-*`, `--space-*`, `--text-*`, `--radius-*`, `--shadow-*`, `--duration-*`, `--ease-*`), and an
  element's own hooks are `--pk-<element>-<part>`. Tokens live only in `tokens/tokens.css`.
- **Size budgets are never raised.** Not the page layer's 10 KB gzip, not an element's. If you are over, make the source smaller.
- **No silent failure.** No empty `catch`, no `.catch(() => {})`, no bare `console.*`: use the SDK logger (`createLogger(scope)` from `js/log.js`; elements have
  `this.log` and `this.warnOnce`). `core/tests/no-silent-catch.test.mjs` checks.
- **Only existing components.** Use the `pk-*` elements that exist; a gap is recorded in the "components the SDK lacks" issue, not invented locally.
- **Privacy.** No personal paths, real email addresses or internal tracker references anywhere (`core/tests/privacy.test.mjs`).

## Commits, pull requests, issues

- Commit messages: a short imperative subject and a body saying why. End with the attribution the tool gives you (the `Co-Authored-By` line); do the
  same in the pull request description when the tool gives one. Do not invent your own.
- Pull request: use `.github/pull_request_template.md`. One `Closes #n` per issue, each on its own line (GitHub closes only the first of a list), **when the pull
  request finishes the issue: merging closes it automatically** (owner directive). `Refs #n` only for an issue the pull request merely advances, and then say on the issue
  what remains. The description says what changed and why, and how you verified it.
- **Issue hygiene.** Comment on the issue with what changed and what remains, and tick the checklist items the pull request completes. Never close an issue by
  hand: the merge of a `Closes #n` pull request does it (an issue decided against is closed by the owner as "not planned").

## Releases

- **Packages are published only from a version tag.** Merging to `main` never publishes anything. CI may build and pack for verification but never pushes to a registry.
- A release goes through a release pull request (`release/X.Y.Z`, template `release.md`): `core/VERSION` set, the changelog compiled
  (`node scripts/changelog.mjs compile --version X.Y.Z`), the API baseline refreshed. The tag `vX.Y.Z` must equal `core/VERSION`; `release.yml` refuses otherwise.
- **Cadence:** a release is cut when a batch of finished issues is worth shipping, not on a schedule. nuget.org versions cannot be deleted, only unlisted,
  so publish less often, not more.
- Details: `CONTRIBUTING.md` ("Versioning and releases") and `PUBLISHING.md`.

## Never, without the owner

Push tags (a tag publishes), publish to any registry, change repository settings (branch protection, merge settings, secrets, Pages),
close issues by hand, force-push (to any shared branch), delete branches you did not create. If the task seems to need one of these,
stop and say so on the issue or in your report.
