# Repository settings the owner should apply

Nothing here has been applied. These are the settings the trunk-based flow (`CONTRIBUTING.md`, `AGENTS.md`) assumes, each with the reason and the
exact `gh` command. Review, then run them yourself (they need admin rights on `skulmunkie/plainkit` and `gh auth login`). Read the current state first:

```
gh api repos/skulmunkie/plainkit --jq '{allow_squash_merge, allow_merge_commit, allow_rebase_merge, allow_auto_merge, delete_branch_on_merge}'
gh api repos/skulmunkie/plainkit/branches/main/protection
```

## 1. Merge settings: squash only, auto-merge, delete branch on merge

Why: one issue is one pull request is one commit on `main` (a readable, linear history, easy to revert); auto-merge lets a green pull request land
without waiting for a person; branches are short-lived, so they should not pile up.

```
gh api -X PATCH repos/skulmunkie/plainkit \
  -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false \
  -F allow_auto_merge=true -F delete_branch_on_merge=true \
  -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=PR_BODY
```

## 2. The `no-changelog` label

Why: `ci.yml` skips the "needs a changelog fragment" rule for a pull request with this label.

```
gh label create no-changelog --repo skulmunkie/plainkit --color ededed --description "No user-visible change: no changelog fragment needed (say why in the description)"
```

## 3. Protect `main`

Why: a pull request is the only way in; the checks that prove `main` is releasable must pass first; history stays linear; nobody rewrites `main`;
review comments get resolved. The required check names are the job names in `.github/workflows/ci.yml`, exactly: `Toolkit (node)`,
`Changelog (fragments)`, `Blazor (dotnet)` (job ids `node`, `lint`, `dotnet`). (Run each check once on a pull request before requiring it; GitHub only lists checks it has seen.)
The other jobs run but are **not required**: `Browser (element suite)` (promote it after a few clean runs by adding it to the list below) and `Package (contents)`
(only runs when packaging inputs change), and `CI summary` (writes the sticky comment). A pull request that changes only docs still reports all three required checks: each job
decides for itself with `scripts/ci-changes.mjs` and finishes green in a few seconds, so never require a check from a workflow that has a workflow-level `paths:` filter (it would
stay pending forever). `scripts/tests/ci-workflow.test.mjs` fails when these names and `ci.yml` disagree.
No approving review is required (a single-owner repository can not approve its own pull requests); raise `required_approving_review_count` when there
are more maintainers. `enforce_admins` is off so the owner can still fix a broken `main` in an emergency; turn it on for no exceptions.

```
gh api -X PUT repos/skulmunkie/plainkit/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "checks": [
      { "context": "Toolkit (node)" },
      { "context": "Changelog (fragments)" },
      { "context": "Blazor (dotnet)" }
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 0, "dismiss_stale_reviews": false },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
JSON
```

`strict: true` ("require branches to be up to date") makes every pull request rebase on the latest `main` before merging, which is what the
merge queue (below) will do for you; while there is no queue, set it to `false` if the extra rebases get in the way.

## 4. Protect release tags

Why: a tag publishes to NuGet, and nuget.org versions can not be deleted. Only the owner should be able to create a `v*` tag, and nobody may move or delete one.

```
gh api -X POST repos/skulmunkie/plainkit/rulesets --input - <<'JSON'
{
  "name": "release tags",
  "target": "tag",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/tags/v*"], "exclude": [] } },
  "rules": [ { "type": "creation" }, { "type": "update" }, { "type": "deletion" } ],
  "bypass_actors": [ { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" } ]
}
JSON
```

(`actor_id` 5 is the Admin role: admins can still create the tag, agents and other roles can not.)

## 5. Merge queue (a later phase)

Why: with many small pull requests landing quickly, the queue tests each one on top of the latest `main` plus the ones ahead of it, so `main` never
breaks from two individually green pull requests. It needs two things: `ci.yml` must also run on `merge_group` events (add `merge_group:` under `on:`;
the workflow does not have it yet), and the rule below, which is a ruleset on the branch (it replaces the classic protection of section 3, so move those
settings into the same ruleset when you switch).

```
gh api -X POST repos/skulmunkie/plainkit/rulesets --input - <<'JSON'
{
  "name": "main queue",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "pull_request", "parameters": { "required_approving_review_count": 0, "dismiss_stale_reviews_on_push": false, "require_code_owner_review": false, "require_last_push_approval": false, "required_review_thread_resolution": true } },
    { "type": "required_linear_history" },
    { "type": "non_fast_forward" },
    { "type": "deletion" },
    { "type": "required_status_checks", "parameters": { "strict_required_status_checks_policy": false, "required_status_checks": [ { "context": "Toolkit (node)" }, { "context": "Changelog (fragments)" }, { "context": "Blazor (dotnet)" } ] } },
    { "type": "merge_queue", "parameters": { "merge_method": "SQUASH", "grouping_strategy": "ALLGREEN", "min_entries_to_merge": 1, "max_entries_to_merge": 5, "min_entries_to_merge_wait_minutes": 1, "max_entries_to_build": 5, "check_response_timeout_minutes": 30 } }
  ]
}
JSON
```

Merge queue availability depends on the plan; if the API refuses the `merge_queue` rule, leave this for later.
