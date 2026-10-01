# UI review and CI cycle time: run the full sweep rarely, and make it cheap when it runs

Status: proposed. Tracking: #713 (cycle-time umbrella). Related: #712, #739, #741, #749, #750.

## Where the time goes (measured, 2026-09-30)

A full `node scripts/ui-review.mjs --all` renders 120 elements and 50 scenarios, 1,746 screenshots, in four viewport/theme combinations each.

| | first measurement | after #751, #757, #760, #762 |
| --- | --- | --- |
| gallery examples | 477 s | 487 s |
| scenarios | 1,021 s | 869 s |
| total | 25.0 min | 22.6 min |

Scenario time now (summed): other steps 298 s, the settle before each shot 206 s, fixed waits 201 s, page open 129 s, screenshots 35 s. No element hangs (`notSeen` is empty). Speeding up the loop has returned about 10 to 25% per change; it will not get a 22-minute job under a few minutes by itself.

## What triggers it

- A pull request runs the `ui-review` job on every push. It reviews the changed elements and their dependents (#739, #744), in four shards (#741, #743). Typical pull requests finish each shard in under 10 seconds.
- A change under `core/base`, `core/tokens` or `core/layouts` selects **every element**, so each push to such a pull request is a full sweep. The job also starts four runners, each with an install, for a change under `core/js` or `core/modules` that selects nothing.
- Locally, AGENTS.md asks for a run after a look-changing edit. Nothing needs `--all` on demand.

The full sweep is a coverage check, not an inner-loop step. It is being paid for as one.

## Proposal

### 1. Run the full sweep on a schedule, not per push

- A workflow `ui-review-sweep` runs `--all` in four shards **nightly on `main`**, on a release pull request, and on manual dispatch.
- A pull request that touches only base, token or layout files still gets the **changed-and-dependents** review, plus the elements whose CSS references the changed token (#739 gap 3) once that exists. Until then, such a pull request keeps the current behaviour, behind a label `ui-review-full` instead of every push: the job posts one line saying "base files changed, full review skipped; add the label to run it".
- A sweep error opens (or updates) one tracking issue with the screenshot name and the steps, instead of failing a pull request that did not cause it.
- Locally nothing changes: `--all` stays available and unchanged.

### 2. A content-hash cache (#749)

Per element and per scenario, hash every input that can change its pixels (its folder, the files of the elements it composes, `core/base`, `core/tokens`, `core/layouts`, `core/js`, the review harness, `scripts/ui-review.mjs`, the Chrome version). A hit reuses the stored screenshots and findings; a miss renders. In CI the cache is `actions/cache` keyed on the combined hash. A sweep with nothing changed then takes seconds, and a token change re-renders only what the hash says changed. Rule: hash too much, never too little; a stale screenshot that hides a regression is worse than a slow run.

### 3. Do less work per element, without dropping a finding

Overflow, overlap and clipping do not depend on the theme. Tag each audit rule with what it depends on (viewport, theme) and run theme-independent rules once per viewport; contrast and the screenshots stay in both themes. Roughly halves the audit work. Only done if every rule is tagged and a test shows the findings match a full run.

### 4. The smaller levers, after 1 and 2 show what is still slow

- The settle floor: about 500 s of the scenario time is the fixed wait after each step and before each shot (150 ms timer plus frames). Now that settle also waits for running animations (#760) it can likely shrink; verify with a screenshot baseline diff, as in #760 and #762.
- Scenario latencies: waits that equal a scenario's own simulated delay (a 1,500 ms load timer) are cut by shortening that delay in the scenario, not by a condition wait (a condition wait saves about 0.2 s there). Waits that prove an element's real timing stay.
- Parallel tabs in one browser (#712) divide the gallery part evenly; worth it only if that part still dominates after 1 and 2.

## Out of scope here

Also under #713 and not designed here: the rest of the CI cycle (push to green per job, local `verify.mjs`, duplicated work between them, stale or duplicate tests). It needs its own measurement first: per-job time for the last N pull requests.

## Acceptance

- [ ] The sweep workflow exists, runs nightly on `main` in four shards, and opens a single tracking issue on an error; the pull request job no longer runs a full sweep on every push.
- [ ] A cache hit yields the same findings and the same files as a render; `--no-cache` renders everything; a corrupt entry is re-rendered.
- [ ] No audit finding skipped or weakened; a sweep on a cold cache equals today's `--all`.
- [ ] Measured: nightly sweep wall time, a warm-cache sweep, and a pull request touching `core/tokens`, each before and after.

## Order of work

1. The scheduled sweep workflow and the `ui-review-full` label (small, removes the per-push full sweep).
2. The cache (#749).
3. Audit rules tagged by dependency, then theme-independent rules run once.
4. The smaller levers, with the baseline diff each time.
