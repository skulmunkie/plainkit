---
title: Conformance audit
order: 9
summary: A CLI that checks a consumer app's own source for patterns Plainkit already has an element or a pattern for - duplicated markup, literal colours and sizes, missing accessible names, hand-built pages instead of the app framework. Rule ids, severity in normal and strict mode, and where the same rules live in the agent skills.
---

Plainkit ships components, tokens and an app framework so an app never has to re-invent a dialog, a data table or a themed colour. Nothing stops an app from doing it anyway - a hand-rolled modal `<div>`, a literal `#ff0000`, a page built with its own header and nav instead of `mountApp`. `node audit.mjs` is a CLI that reads an app's own HTML, CSS, JS/TS and Razor files and reports exactly that: places where the app duplicates something Plainkit already provides, skips a token, or is missing an accessible name.

## Running it

The audit is its own module, `plainkit.audit`, and is not part of the npm package (there is no npm package for it): unzip `plainkit.audit-<version>.zip` from the GitHub release (the full `plainkit-dist` zip contains it too) or take the files from the Pages folder `packages/plainkit.audit/`, and run `node audit.mjs` from that folder with Node 18 or newer. `npx plainkit audit` only prints these instructions.

```text
node audit.mjs                 # normal mode: only real problems are errors
node audit.mjs --strict        # strict mode: most warnings become errors too
node audit.mjs --list-rules    # every rule id, its severity in both modes, what it detects
node audit.mjs --explain D2    # one rule's detects/severity/docs/fix text
node audit.mjs --format json   # for another tool to read
node audit.mjs --format sarif  # for github/codeql-action/upload-sarif
```

A finding is one line - file, line, column, severity, rule id, message - followed by a `FIX:` line naming the element, token or pattern to use instead. The exit code is non-zero when strict mode (or a maximum-warnings flag) is not satisfied, so it can gate a build the same way `node scripts/verify.mjs` gates this repository's own CI.

## The rule families

Every rule belongs to one of six families; the id's letter says which. Full ids, severities and a wrong/right snippet for each one: the agent skills' `references/conformance-rules.md` (`plainkit-sdk` and `plainkit-blazor` ship the same file, generated from the same rule table the list-rules flag above reads, so the two can never drift apart), or the explain flag shown above, for one rule id from the command line.

| Family | Catches |
|---|---|
| S | The strict-module standards this repository holds its own code to: literal styles, hand-rolled DOM queries where a component would do, script-src/style-src violations. |
| D | Duplicating an element or its interaction logic - a hand-built `<table>` instead of `pk-table`, a `.modal` div instead of `pk-dialog`, reimplementing roving-tabindex or Escape-to-close by hand. |
| P | Pages and app structure - a page with its own header and nav instead of `mountApp`, a `mountApp` with no `defineModule` modules, a module missing `id`/`title`/`routes`, state kept in `localStorage` instead of the module's own state, a page factory with its own `AbortController`, busy flag and teardown instead of `createLifecycle` (P10). |
| T | Tokens and standards - a literal colour, size or font instead of a token, a typo'd or deprecated tag or import path. |
| A | Accessibility attributes - an icon-only button, dialog, tab or image with no accessible name; a page shell with no `lang`, viewport meta or main landmark. |
| B | Blazor and Razor only - a raw tag in a `.razor`/`.cshtml` where a `Pk*` component exists, `Class`/`Style` set on a component instead of its own parameters, an unknown component or parameter, a `@page` with no `PageBase`, JS interop duplicating a component, a `<script>`/inline `onclick`/non-literal `MarkupString`, a component (`.razor` or `.cs`) with its own `IDisposable` + `CancellationTokenSource` or busy/error fields instead of `PageBase`/`PkComponentBase` (B7), a component whose `[Parameter]` names overlap a `Pk*` component's by 80% or more, a probable duplicate (B8, warning only). |

`.razor` and `.cshtml` files run every family's markup rules too (S, D, T, A and P apply to Razor markup the same as HTML - the tokenizer is already Razor-aware: `@* *@` comments, `@{ }`/`@( )` blocks and `Pk*` components are recognised); `B` only covers what the Blazor surface adds. Data for `B` comes from `blazor/mappings/*.json`, the same source the `plainkit-blazor` skill and `scripts/generate-blazor.mjs` already read.

## Severity: normal versus strict

Most rules are a warning in normal mode and an error in strict mode - useful during day-to-day work, a hard gate before a release. A few rules that *guess* rather than prove something (an inferred page type, a heuristic reduced-motion override) stay warnings even in strict mode, so a build never fails on a guess. Two flags narrow a run to specific ids (one to select, one to exclude); a `plainkit.audit.json` config file can set per-rule severity, an allow-list (an entry that can only shrink over time, never grow silently) and a baseline so an existing app can adopt the audit gradually instead of fixing everything on day one.

## Ignoring one finding in the source

A comment `plainkit-audit-ignore D1 -- why this is fine` (inside `<!-- -->`, `@* *@`, `/* */` or after `//`) suppresses that rule on its own line and the line right after it. Several ids may be comma separated. To cover a range, bracket it with `plainkit-audit-ignore-start D1 -- why` and `plainkit-audit-ignore-end`. The rule id and the reason are required, and there is no file-level ignore. A comment with no reason, a rule id the audit does not know, an unended or stray block marker is itself an error and suppresses nothing. A suppression is never silent: each one is printed as `ignored with reason` with its reason, counted in the summary (`N suppressed inline`, and `ignoredWithReason` in the JSON summary), and the list-suppressions flag prints them all.

## Safe fixes

Three edits are deterministic and reversible, and run only when you name them. The first rewrites `<hr>` to `<pk-divider>` and an empty `<progress value max>` to `<pk-progress value max>` when the tag has no other attribute. The second adds `label` to an icon-only `<pk-button>` from its static `title` (the title stays). The third removes a dead entry and lowers a stale `count` in `plainkit.audit.json`. Add the dry-run flag to print a diff and write nothing. A line carrying, or right after, a `plainkit-audit-ignore` comment is never rewritten; everything else stays a suggestion. An ignore comment that suppresses nothing is reported with its file and line (a warning, an error in strict mode), and the list-suppressions flag marks it (unused).

```bash
node audit.mjs --fix D1-simple --dry-run
node audit.mjs --fix D1-simple,A1-label
node audit.mjs --update-allow
```

## Running it before it is published

Until the CLI ships as part of the npm/NuGet packages, it only exists in a plainkit source checkout: `node
<checkout>/core/tools/audit/cli.mjs <target>`. A consumer app that wants to gate its own CI on this before
then can check out plainkit as a sibling repo and run the CLI from there - `examples/audit-cli/` in this
repository has a minimal bash and PowerShell runner for exactly that, including the baseline flags
(see `core/tools/audit/baseline.mjs`) for gating on new findings only, not the whole existing backlog. Once
`node audit.mjs` works from the published package, drop the sibling checkout and those example scripts.

## An agent that cannot run the CLI

The agent skills carry the same rule table as a "Check your work" step (their `SKILL.md`, near the end of the workflows): run `node audit.mjs --strict` before finishing, fix each finding by its id, and treat a finding that is a genuine SDK gap as a tracker issue rather than a local workaround. For an agent with no way to run Node, the same step lists every rule id grouped by family as an inline checklist.
