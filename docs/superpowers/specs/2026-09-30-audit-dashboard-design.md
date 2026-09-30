# Audit dashboard: a live viewer for existing audit/test artifacts

## Problem

PlainKit produces several kinds of findings — module-ruleset baseline debt (`plainkit.audit.modules.baseline.json`), UI review findings (`review-output/manifest.json`), and consumer conformance-audit output (`plainkit audit --format json`) — but none of them have a browsable UI. Each is either a flat JSON file or CLI text output. Reading through hundreds of findings by grepping JSON or scrolling terminal output is slow and error-prone, and there is no way to filter, group, or sort findings interactively.

The scorecard already has its own dashboard (`core/site/scorecard/`); this is deliberately not duplicated here.

## Goals

- A devtools module presenting the other three report types (module baseline, UI review, conformance audit) as browsable, filterable, sortable panels.
- Zero added runtime cost to any audit/test/build step: this is purely a viewer over artifacts that already exist on disk.
- Fast to open and use even when a report has hundreds of findings.

## Non-goals

- Triggering any audit, test, or build run from the browser. The dashboard never shells out, never calls `scripts/audit-modules.mjs`, `scripts/ui-review.mjs`, or the conformance-audit CLI itself. It only reads whatever JSON is already on disk.
- Replacing or duplicating the scorecard's own dashboard.
- Aggregating findings across a time series / history. This shows the latest on-disk snapshot of each report, nothing more.

## Design

### Module shape

`core/modules/audit-dashboard/`, a `defineModule` devtools module following the existing pattern (`code-explorer`, `logs`, `theme-editor`). Registered the same way those are, reachable from the internal site's devtools nav.

The dashboard's layout is `pk-dock` itself (the dockable/floating workspace element from #432/#618/#639) — each report is a dockable panel the user can arrange, resize, float, or collapse to a rail, rather than a fixed tab strip. This reuses real, already-shipped, already-budget-conscious infrastructure instead of building bespoke layout chrome, and gives "digestible chunks" naturally: a panel a user isn't looking at can be collapsed or floated aside instead of competing for space.

Within each report panel, group findings using `pk-dock`'s own panel-grouping (tree groups, per #618) where it fits — e.g. the module-baseline panel can itself be split into a "by file" group and a "by rule id" group as separate dockable sub-panels a user can view side by side or swap between, rather than a single flat table with a dropdown filter. Use a nested/child dock group for this if `pk-dock`'s model supports it (check `core/js/dock-model.js`'s group semantics); if grouping within one panel that way isn't a natural fit for the current dock model, fall back to the original per-panel client-side filter/group controls described below rather than forcing it.

Each report panel also gets a small "Properties" side panel (also a dock panel) showing the selected finding's full detail (file, rule id, message, fix text) when one is selected in the main findings list, instead of cramming full detail into every row of a dense list. This is the "properties" breakdown the owner asked for: selecting a finding populates a properties panel rather than expanding inline.

### Panels, each independently lazy-loaded

Three report panels (each docked within the shared `pk-dock` workspace), each its own lazy chunk (same static-import-per-feature split just used in #639's dock.js work) — opening one never pulls in the JS or data for the others:

- **Module baseline** — reads `plainkit.audit.modules.baseline.json` (served from repo root via the internal dev server). Groups by file, then rule id; shows total count and per-file counts up front (matching the breakdown format already used manually in #682's paydown work). Selecting a row populates the shared Properties panel.
- **UI review** — reads `review-output/manifest.json` (git-ignored local/CI artifact). Shows findings grouped by severity (error/warning), with the screenshot filename linked so it can be opened directly. Selecting a row populates the shared Properties panel.
- **Conformance audit** — reads a JSON file the CLI can be pointed at (`plainkit audit --format json > <path>`, from #629), loaded via a file picker or a documented fixed path. Groups by rule id and severity, same shape as the CLI's own JSON output. Selecting a row populates the shared Properties panel.

Each panel's own internal filter/sort controls (by rule id, file substring, severity) stay client-side against the already-loaded array, same as originally designed — the dock layout changes how panels are arranged and how detail is surfaced, not how data is fetched or filtered.

### No live execution — explicit staleness

Each panel shows a timestamp: for module baseline and UI review, the source file's mtime (or an embedded `generated` field if manifest.json already has one — confirm at implementation time); for conformance audit, whatever the loaded JSON reports its own run time as, or the file's mtime otherwise. Each panel's header documents the exact command to regenerate that file. No refresh button triggers a re-run; a refresh button only re-reads the same file from disk.

### Data loading and filtering

Each panel fetches its JSON file once, on first open, via a plain `fetch()` against the internal dev server (`core/tools/serve.mjs`) — no build-time bundling of report data. Filtering (by rule id, file substring, severity) and sorting happen client-side against the already-loaded array; report sizes are in the hundreds of entries, not large enough to need virtualization or server-side filtering.

### Testing

- A node test per panel's data-shape parsing (given a small fixture JSON matching each real format, the panel's grouping/filtering logic produces the expected groups) — pure logic, no DOM needed for this part.
- A `core/tests/review/scenarios/` scenario for opening each panel and seeing findings render, using a fixture JSON served in place of a real report (the existing scenario mechanism already supports fixture data injection for other modules).
- No new build-time or bootstrap-time cost: confirm via `node scripts/bootstrap.mjs` timing before/after that adding this module doesn't measurably change bootstrap time (it's just another lazy dev-tool module, same category as existing ones).

## Risks / open questions for the implementing agent to resolve concretely

- Exact on-disk path/convention for the conformance-audit JSON (a fixed expected path under the internal site, vs. a file-picker) — pick whichever matches how `PLAINKIT_AUDIT_ROOT`/existing audit tooling already expects paths to be provided, for consistency.
- Whether `review-output/manifest.json` already carries a `generated` timestamp field (checked informally, not confirmed) — if not, use file mtime.
