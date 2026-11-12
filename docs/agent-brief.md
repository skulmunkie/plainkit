# Brief for a fresh dev agent

The standing brief an orchestrator hands to **every new dev agent**. It is a companion to [AGENTS.md](../AGENTS.md) (read that first) and holds the working
rules and the traps already hit, so each agent starts with the lessons and none of the debris of a long session. People: [CONTRIBUTING.md](../CONTRIBUTING.md).

## How the orchestrator uses it

- **One fresh agent per task**, in a **fresh worktree** made from the integration branch (`git fetch origin`, then
  `git worktree add ../plainkit-wt-<issue> -b agent/<issue>-<slug> origin/<integration-branch>`). A long-lived agent accumulates context and slows down: start
  a new one for each pull request, and remove its worktree and branch once the pull request is merged.
- The prompt to the agent is short: the worktree path, a pointer to this file, the issue number or numbers, and anything specific to the task (a spec to follow,
  an owner decision recorded on the issue, a size or budget to watch). Everything below is the part that does not change.
- Only one agent works on the repository's heavy checks at a time; research and spec agents (no product code, no heavy checks) can run beside a dev agent.
- The orchestrator merges the pull request into the integration branch itself, reads the diff, and gates the whole branch (clean checkout: `verify --pack`, the
  full browser suite, the full UI review, the Blazor browser run, `gate-check`) before the single pull request to `main`.

## Setup and hygiene

- Work **only in your assigned worktree**. Your shell may start in the main checkout: never edit or run anything there. Use absolute paths or `git -C <worktree>`.
- First `npm ci` in the worktree (never junction or delete the root `node_modules`), then `node scripts/bootstrap.mjs`.
- Run git and `gh` commands one at a time: compound commands that start with `cd`, heredocs containing `---` lines and `printf` can be refused by the worktree guard.
  Use a file-writing tool for file content. Files under `core/` and `blazor/mappings/` are CRLF: do not rewrite a whole file with a tool that strips carriage
  returns (check `git diff --stat` for whole-file diffs).
- Ports 5411 to 5440 only. Run long commands in the **foreground** (timeout up to 10 minutes) and never stop with background work running. When you finish, no
  node or browser process of yours may be left running, and you delete only temp directories you created (never wildcard `pk-*`).
- Never raise a ceiling, edit or weaken a test, add an allow-list entry, or hand-edit a generated file. If a test or a budget seems wrong, stop and say so.

## Checks to run (after your last edit)

- `node scripts/verify.mjs --changed --base origin/<integration-branch>`. Without `--base` it compares with `origin/main`, selects the whole browser suite and hangs.
- `node --test core/tests/breakpoints.test.mjs core/tests/budgets.test.mjs core/tests/page-weight.test.mjs core/tests/package-size.test.mjs`.
- The browser cases of every element you changed: `node scripts/attest-browser.mjs --filter "<names>"` (it prints "N of M cases selected"). A node-only check has let a
  regression through before.
- A change to how something **looks**: `node scripts/ui-review.mjs --elements <names>`; open every relevant screenshot with the Read tool and describe what you saw. A gallery
  example may not show a new state, so add or extend a scenario in `core/tests/review/scenarios/`.
- **Every layout expectation is a measuring browser case written before the code and shown failing on the old code**, then passing. Use real mouse clicks (DevTools) for click
  behaviour: a synthetic `click()` hides ordering bugs.
- A Blazor-visible prop or event goes through `blazor/mappings` (`extra: true` for a new parameter on a hand-written component). Run the filtered `dotnet test` and
  `node scripts/blazor-browser.mjs --changed --base origin/<integration-branch>` when you touch mappings, the generator or a page wrapper.

## Known traps

- A `:host` rule inside `@container` cannot query the host's own container: set the variable on a descendant.
- A CSS comment containing an issue number such as `#1906` trips the literal-colour guard. A new CSS custom property must be declared in the element's `meta.json`
  `cssProperties`; a new write to a foreign node must be declared in its `writes` (the ownership test).
- Hiding a named-slot node with `::slotted` is forbidden (the slotted-hide guard): hide the `<slot>` element.
- The page-weight pages (button, form, table) and the package ceilings are never raised. Shrink the source, fold new code into existing code paths, keep CSS in the
  element's own stylesheet, or put it in a lazy chunk.
- The word `location.` or a `/wwwroot/` string in shipped meta, docs or audit copy can trip the audit-modules and carveout tests.
- The skills files have a 250-line cap: append to an existing line.
- A user-visible change needs a changelog fragment (`node scripts/changelog.mjs new <type> <slug> --issue N`, no placeholder text); a change with no visible effect
  gets the `no-changelog` label and a reason in the description.
- Owner rules: consolidate (a flag or setting on an existing element beats a new element, and the check goes in the spec or pull request); tokens only in CSS;
  ownership and reactivity (`core/STANDARDS.md`).

## Delivery

- One branch `agent/<issue>-<slug>` and **one pull request** (base: the integration branch, never `main`) per task, about 400 hand-written lines at most. The body goes
  in a file (`--body-file`) and ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`; commit messages end with the `Co-Authored-By` line the
  tool gives you. `Closes #N` only when the pull request fully finishes the issue, otherwise `Refs #N`.
- **Do not merge.** Note anything out of scope on the issue (or open a new one) instead of fixing it.
- **Report**, then stop: the pull request number; what changed and why; the **real** check results (counts, never "clean except"); the screenshots read and what you saw;
  byte numbers for any CSS or JS added; anything surprising; anything left over.
