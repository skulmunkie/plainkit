# Delta-only UI review baseline (spike)

Status: proposal, owner approved the spike 2026-10-27. Docs only; no code is changed by this file.

## Goal

Store and review only the screenshots that CHANGED. Today `node scripts/ui-review.mjs` renders every selected shot (element examples and scenarios, desktop 1280 / phone 375, light / dark) and a reviewer opens all of them (AGENTS.md, "Reviewing what it looks like"). Cold full run: 638 s. CI keeps the PNGs as artifacts `ui-review-1` to `ui-review-4` (four shards, `ci.yml` job `ui-review`, `--cache --base HEAD^1 --shard K/4`).

Design under test: a content-hash manifest in git; images stored content-addressed on an orphan branch `ui-baseline` (like `issue-images` and `scripts/issue-image.mjs`); updated only by CI on `main`; a PR comment listing only shots whose hash differs; local `ui-review` skips shots whose inputs are unchanged.

## 1. Determinism first (gate for everything else)

A hash baseline is worthless if the same tree renders different bytes twice. Check before building anything.

Workflow `ui-baseline-determinism.yml`, `workflow_dispatch` only, inputs `ref` (default `main`) and `full` (default true):
1. Matrix `run: [1, 2]` x `shard: [1..4]`, `runs-on: ubuntu-latest` (the `ci.yml` runner image), checkout `ref`, same setup and bootstrap steps as the `ui-review` job.
2. `node scripts/ui-review.mjs --all --shard $SHARD/4` with the cache off (a cache hit would hide nondeterminism). Run 2 is a separate job, not a second pass in the same process.
3. `cd review-output && sha256sum *.png | sort -k2 > ../hashes-$RUN-$SHARD.txt`; upload as an artifact.
4. Final job `compare` (needs all): download, `cat hashes-1-*.txt | sort > a`, `cat hashes-2-*.txt | sort > b`, `diff a b`; print the differing names and count, fail if any, upload the differing PNG pairs. Dispatch it on three different days (runner fleets change).

Pass = zero differing shots in three dispatches. If shots differ, the options:
- (a) Hash only CI renders. Needed regardless: Windows fonts and anti-aliasing differ from Linux, so local renders never write the baseline and compare only as advisory. Free, but does not cure CI-versus-CI flakiness.
- (b) Hash DOM + computed styles + font inputs instead of pixels. Deterministic by construction, but blind to paint defects (clipping, z-order, shadows), which is what screenshots exist for. Not acceptable as the only signal.
- (c) Pixel tolerance (for example under 0.02 percent differing pixels and no differing block over 8x8 px). Needs the baseline PNG, not just a hash: hash equality stays the fast path, pixel diff runs only when hashes differ.

Recommendation: (a) always; add (c) only if the job shows flakiness; keep (b) as an optional extra "layout fingerprint" column later. Pin the Chrome version in the job (it is already in the cache key) and use only bundled fonts; unpinned system fonts are the usual cause.

## 2. Manifest, shards, naming, size

- File `core/tests/review/baseline.manifest.txt`, CRLF, one line per shot: `<shot-name><TAB><sha256 first 16 hex>`, sorted by name, first line `# ui-baseline v1 chrome=<major>`. The shot name is the PNG basename without extension, exactly today's naming: `<tag>__<example>__<desktop|phone>__<light|dark>` for examples and `scenario-<name>__<shot>__<desktop|phone>__<light|dark>` for scenarios (the `file` field of `manifest.shots`). Sorted text diffs and merges line by line.
- Only the CI job on `main` edits it (section 3), never a PR, so PRs never conflict on it.
- Shards: each of the four shards writes `baseline-part.txt` (its own lines) next to its `manifest.json`; the existing merge (`mergeManifests`, used by `--jobs`) concatenates and sorts the parts and fails on one name with two hashes. A shard cannot see all shots, so "shot removed" is decided only by a full-sweep merge on `main` (`--all`), never per shard and never for a PR (whose selection is the changed elements: an absent name means "not rendered").
- Orphan branch layout: `ui-baseline/<hash16>.png`, flat and content-addressed. Identical images (most shots never change) are stored once.
- Size after one year. Evidence: 127 commits since 2026-09-20 on main, 59 of them in the last year matching "ui review, screenshot, css, layout, look" by subject, so on the order of 10 UI PRs a week, about 500 a year. Assumption to be measured in brief b: a UI PR changes about 25 shots after dedupe at about 40 KB each. 500 x 25 x 40 KB is about 500 MB unpruned; the live set (a few thousand shots) is 100 to 200 MB. With the pruning below, expect 150 to 250 MB.
- Pruning: after each push, keep only hashes referenced by the last N=30 versions of the manifest on `main` (`git log -n30 -p -- core/tests/review/baseline.manifest.txt`) and delete the rest in the same commit. Deleted blobs stay in history, so every ~3 months the bot squashes the branch to one commit (force push of that one bot-owned branch; owner decision, see NEEDS-OWNER Q14b).

## 3. PR flow

On a PR the four shards render the selection as today (unchanged `--cache` flow) and now also write `baseline-part.txt`; the PNGs remain artifacts as audit evidence. A new job `ui-baseline-compare` (needs `ui-review`, same path gate, not required) downloads the parts, concatenates them and compares against `core/tests/review/baseline.manifest.txt` at the merge base, classifying each rendered shot as `same`, `changed` or `new`. Unrendered names are ignored.

Comment: one sticky comment with marker `<!-- ui-baseline -->` (like `<!-- ci-summary -->`), found by marker and created or PATCHed through `gh api repos/skulmunkie/plainkit/issues/<pr>/comments`. Body: counts, then a table of only the `changed` and `new` shots: name, before (`https://raw.githubusercontent.com/skulmunkie/plainkit/ui-baseline/<oldhash>.png`), after. "After" images are not on the baseline yet, so the job pushes them to a second orphan branch `ui-baseline-pr` as `pr-<n>/<hash>.png` (removed when the PR closes); the fallback is the workflow artifact, which needs a GitHub login. At most 40 rows, then "and N more: see the artifact".

Linking an image in an issue: `![found](https://raw.githubusercontent.com/skulmunkie/plainkit/ui-baseline/<hash16>.png)` for baseline shots (stable until pruned); use `scripts/issue-image.mjs` for an image that must never be pruned.

Main updates the baseline without a human: workflow `ui-baseline-update.yml`, `on: push: branches: [main]`, `concurrency: ui-baseline` (queue, no cancel), path-gated like `ci-changes.mjs ui-review`. It renders the merged change's selection in four shards, merges the parts, and `scripts/ui-baseline-push.mjs` (temporary worktree of `ui-baseline`, adds only hashes not yet present, prunes, commits, pushes, one fetch-and-rebase retry, never a plain-history rewrite; modelled on `issue-image.mjs`) uploads the new PNGs. Then the manifest is committed to `main` (needs `contents: write` in that workflow only; NEEDS-OWNER Q14a: fallback is to keep the manifest on `ui-baseline` and refresh the repo copy in the release PR).

Failure modes:
- Flaky shot: the compare job re-renders every `changed` shot once; only a shot that differs on both renders is a change; one that flips back is listed as "unstable" (warning). Chronic ones are filed as issues.
- Intentional change: nothing to do; it shows as changed, the reviewer looks, merges, and main adopts the hash.
- Rebase, or two PRs touching a shot: the comment is computed against the merge-base manifest, so a push recomputes it; the post-merge job renders the merged tree, so the later merge wins correctly.
- Post-merge job fails or lags: the manifest stays old and later PRs show extra "changed" shots (noisy, never wrong). A failure opens or updates one issue, like the nightly workflows.
- Browser or font bump: the `chrome=` header mismatch makes the compare say "baseline built with another browser" and skip the diff; a manual dispatch rebuilds the whole baseline.

## 4. Replacing "open every screenshot"

New AGENTS.md wording: open every screenshot the `ui-baseline` comment lists as changed or new, and always those of the scenario you added or extended; an unchanged shot needs no look. Audit findings are untouched: they come from `manifest.json` (overflow, clipping, overlap, tap targets, contrast, names) for every rendered shot, changed or not, and errors still make `ui-review.mjs` exit 1 with their `FIX:` line. Only the human look narrows. "Not merged on green CI alone" stays: the orchestrator looks at the changed shots in the comment. An unexpectedly large change (a token edit moving hundreds of shots) is itself the signal; beyond 40 rows the reviewer samples per element.

Locally, with the manifest present, `ui-review.mjs` prints same, changed or new per shot (advisory off Linux) and `--only-changed` leaves unchanged PNGs out of `review-output/`. It extends `--cache-dir`: the cache key already hashes every input (`ui-review-cache.mjs`), so a unit whose key equals the one recorded at baseline time (sibling file `baseline.units.txt`, unit key per shot) is skipped before rendering.

## 5. Cost and risks

- CI minutes: the PR render already runs; added are the compare job (about 1 minute) and the PR-image push (about 30 s). The post-merge job is one extra run of the four shards per UI merge (path-gated), roughly one extra review run per UI merge. The determinism check is 8 shard jobs per dispatch, three dispatches, once.
- Local time: cold full run 638 s today. Warm, with unchanged units skipped by key, a one-element change renders only its units: estimated 20 to 60 s plus startup (to be measured in brief c). The saving that matters most is reviewer time: the shots opened fall from all of them to the changed ones.
- Risks: nondeterminism (section 1 is the gate); orphan branch growth (prune plus squash); a bot pushing to `main` (decision); raw image URLs need a public repo like `issue-images` (verify); a wrong `same` hiding a change (mitigated by hashing bytes and keeping audit errors independent).
- No budget or ceiling is touched: only a test-data text file under `core/tests/review/`, scripts and workflows are added.

## Follow-up briefs

a determinism workflow; b manifest writer (`ui-review.mjs`); c comparator and skip-unchanged (needs b); d update job on main with `scripts/ui-baseline-push.mjs` (needs a green, b, c, Q14a); e PR comment job (needs b, c, d); f docs and AGENTS.md / skills wording (needs e).
