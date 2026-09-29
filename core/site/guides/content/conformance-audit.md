---
title: Conformance audit
order: 9
summary: A CLI that checks a consumer app's own source for patterns Plainkit already has an element or a pattern for - duplicated markup, literal colours and sizes, missing accessible names, hand-built pages instead of the app framework. Rule ids, severity in normal and strict mode, and where the same rules live in the agent skills.
---

Plainkit ships components, tokens and an app framework so an app never has to re-invent a dialog, a data table or a themed colour. Nothing stops an app from doing it anyway - a hand-rolled modal `<div>`, a literal `#ff0000`, a page built with its own header and nav instead of `mountApp`. `npx plainkit audit` is a CLI that reads an app's own HTML, CSS, JS/TS and Razor files and reports exactly that: places where the app duplicates something Plainkit already provides, skips a token, or is missing an accessible name.

## Running it

```text
npx plainkit audit                 # normal mode: only real problems are errors
npx plainkit audit --strict        # strict mode: most warnings become errors too
npx plainkit audit --list-rules    # every rule id, its severity in both modes, what it detects
npx plainkit audit --explain D2    # one rule's detects/severity/docs/fix text
npx plainkit audit --format json   # for another tool to read
npx plainkit audit --format sarif  # for github/codeql-action/upload-sarif
```

A finding is one line - file, line, column, severity, rule id, message - followed by a `FIX:` line naming the element, token or pattern to use instead. The exit code is non-zero when strict mode (or a maximum-warnings flag) is not satisfied, so it can gate a build the same way `node scripts/verify.mjs` gates this repository's own CI.

## The rule families

Every rule belongs to one of five families; the id's letter says which. Full ids, severities and a wrong/right snippet for each one: the agent skills' `references/conformance-rules.md` (`plainkit-sdk` and `plainkit-blazor` ship the same file, generated from the same rule table the list-rules flag above reads, so the two can never drift apart), or the explain flag shown above, for one rule id from the command line.

| Family | Catches |
|---|---|
| S | The strict-module standards this repository holds its own code to: literal styles, hand-rolled DOM queries where a component would do, script-src/style-src violations. |
| D | Duplicating an element or its interaction logic - a hand-built `<table>` instead of `pk-table`, a `.modal` div instead of `pk-dialog`, reimplementing roving-tabindex or Escape-to-close by hand. |
| P | Pages and app structure - a page with its own header and nav instead of `mountApp`, a `mountApp` with no `defineModule` modules, a module missing `id`/`title`/`routes`, state kept in `localStorage` instead of the module's own state. |
| T | Tokens and standards - a literal colour, size or font instead of a token, a typo'd or deprecated tag or import path. |
| A | Accessibility attributes - an icon-only button, dialog, tab or image with no accessible name; a page shell with no `lang`, viewport meta or main landmark. |

Two rule families reserved by the design (`docs/superpowers/specs/2026-09-28-conformance-audit-cli-design.md`) are not built yet: `B` (Razor-specific checks against `blazor/mappings`) is tracked as its own step on issue [#518](https://github.com/skulmunkie/plainkit/issues/518).

## Severity: normal versus strict

Most rules are a warning in normal mode and an error in strict mode - useful during day-to-day work, a hard gate before a release. A few rules that *guess* rather than prove something (an inferred page type, a heuristic reduced-motion override) stay warnings even in strict mode, so a build never fails on a guess. Two flags narrow a run to specific ids (one to select, one to exclude); a `plainkit.audit.json` config file can set per-rule severity, an allow-list (an entry that can only shrink over time, never grow silently) and a baseline so an existing app can adopt the audit gradually instead of fixing everything on day one.

## An agent that cannot run the CLI

The agent skills carry the same rule table as a "Check your work" step (their `SKILL.md`, near the end of the workflows): run `npx plainkit audit --strict` before finishing, fix each finding by its id, and treat a finding that is a genuine SDK gap as a tracker issue rather than a local workaround. For an agent with no way to run Node, the same step lists every rule id grouped by family as an inline checklist.
