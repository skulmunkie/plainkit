# Developing the core toolkit (moved out of core/README.md)

These notes are for people changing `core/` in the repository, so they live here and not in the npm package README. Paths in the commands are relative to `core/` unless the command says it runs from the repository root.

## Serve and explore

Needs only Node, no install. From the repository root: `node core/tools/serve.mjs`, or on Windows `core\tools\start.cmd` (opens the browser). It serves on port 5310.

```
node tools/serve.mjs 5310          # any static server works; this one has no dependencies
node tools/serve.mjs 5310 --csp    # script-src 'self' (no inline scripts)
```

Open `/` for the site: gallery (every element, layout, template and pattern), theme editor, scorecard, files, guides (Spacing is a gallery foundation, `#/foundations/spacing`). The pages use only
relative paths, so the folder can be served under any prefix (`/sdk/<version>/`).

## Add a guide

The Guides (the `guides` module of the site app, `app.html#/guides`) show the Markdown files in `site/guides/content/`. A guide is `<id>.md` (lowercase letters, digits and dashes: the file name is its address, `#/guides/<id>`) that starts with front matter and then uses `##` and below (the page shows the title as its one `h1`):

```markdown
---
title: Getting started with the SDK
order: 1
summary: One sentence for the list and the top of the page.
---

## Add a sample

Make a folder `samples/patterns/<id>/` (or `samples/templates/<id>/`, `layouts/<id>/`) with `<id>.html` and `<id>.meta.json` (`id`, `title`, `summary`, `used`, `order`, plus `built` and `mobile` for patterns and layouts). `used` must list the elements the markup uses (the `pk-` tags, without the prefix); `node --test tests/samples.test.mjs` prints the exact list when it is wrong. Then run `node tools/build.mjs`.

## Build and test

```
node ../scripts/bootstrap.mjs  # from core/: generate everything (not in git): plainkit.css, gallery data, the Files snapshot, dist/, the Blazor wrappers, the skills
node tools/build.mjs        # only the toolkit part of it (deterministic)
node --test .               # unit, budget, security and API-surface tests (they need the bootstrap first and say so)
node tools/security.mjs     # scan for eval, inline handlers, secrets, unlisted innerHTML, ...
node site/scorecard/static-audit.mjs
```

### The in-browser element suite

`tests/browser/` runs every element in a real browser (about 660 cases, about 10 minutes). The node suite cannot, so run it locally when you change an element source, `js/element*.js`, `js/loader.js` or a browser case. It is not gated on ordinary pull requests: a nightly workflow (`browser-nightly.yml`) runs it on `main` and files or updates the issue "In-browser suite failing on main" (the owner closes it), and the job "Browser suite (release)" runs it on release pull requests, where the owner's branch rule requires it (issue #752). Nothing compares it with the sources, and `tests/browser/report.json` is local scratch output (not committed).

One command does the whole procedure (from the repository root; Node only, no browser package; it needs an installed Chrome, Chromium or Edge, found by `PK_CHROME` or the usual install paths):

```
node scripts/attest-browser.mjs
```

It starts `node core/tools/serve.mjs 5341 --write-reports`, opens `http://localhost:5341/tests/browser/` in a headless browser, waits for the page to post its report (about 10 minutes; it gives up after 1800 s; it writes a trace of every case start and end and a 3 s heartbeat to `pk-attest-trace-<time>.log` in the temp folder, deletes it when the run passes and prints its path otherwise; a case that freezes the page is recorded as failed by name and the page is restarted at the next case), prints the passed and failed counts from `report.json`, then stops the server and the browser and deletes the temporary profile. The exit code is 0 when every case passed, 1 for a failed case, 2 when the run could not finish. `--port`, `--timeout`, `--width` and `--height` are the options; `PK_CHROME_FLAGS` adds browser flags.

By hand, the same thing:

1. `node core/tools/serve.mjs 5341 --write-reports` (`--write-reports` lets the page post its report to the server, which writes `report.json`).
2. Open `http://localhost:5341/tests/browser/` in Chrome at desktop size. Headless: `chrome --headless=new --disable-gpu --no-first-run --user-data-dir=<a temporary folder> --window-size=1280,900 http://localhost:5341/tests/browser/`.
3. Wait about 10 minutes for "report saved" (a visible tab shows it; a headless run has no window, so read the file).
4. Read `tests/browser/report.json` (`passed` and `failed`).
5. Stop the server and the browser and delete the temporary profile (on Windows a browser child can keep the folder locked for a moment; `scripts/attest-browser.mjs` ends the whole process tree and retries).

**Viewport.** Run it at desktop size, 1280x900 or larger. A small window (about 486x425) made the suite flaky, because several cases assert layout, so the script refuses a window smaller than 1024x700. A visible tab must stay in front: a background tab throttles timers.

**In CI.** The suite is not a required check: it takes minutes and reads layout, so a slow or differently configured runner would make a required check flaky, so it stays a manual check. The runners have a Chrome preinstalled, and the script needs no npm dependency, so `.github/workflows/ci.yml` has a `browser` job that runs it on demand (Actions, Run workflow) and uploads `report.json`; it is not part of push or pull request runs. It has not been proven on a runner yet: promote it to a required check only after a few clean runs there.

### The scorecard analysis in one command

`node scripts/scorecard-sweep.mjs` runs the whole analysis headless (Node 22 or newer, no browser package; an installed Chrome, Chromium or Edge, found like `scripts/attest-browser.mjs` does, and `PK_CHROME` overrides). It starts the SDK server, drives the site over the DevTools protocol, then stops the server and browser and deletes the temporary profile. Three stages, all by default (`--only sweep,quality,pages`):

- **sweep**: every gallery view, template and element example at 320, 375, 640, 1024, 1280 and 1920 px in both themes (`site/scorecard/sweep.js`): overflow, phone controls under 44 px, nested scrollers, text under the size tiers, level-1 headings. Each item is loaded once, then resized and re-themed (`--fresh-frames` loads a frame per cell, the slow cross-check), and several browser tabs share the items (`--tabs`, default 4; `--frames`, default 3 per tab). A frame is measured when its toolkit elements are defined, its styles are applied and its layout has stopped changing (no fixed sleeps). `--kinds views,templates,samples`, `--filter <name fragments>`, `--widths` and `--themes` narrow a run to what a change touches; a full run takes minutes, not the 37 of the first version.
- **quality**: the scorecard run itself (the host page's own options): every element example through the SDK quality checks (`js/quality.js`) at each scoring width and theme, plus the measured performance and scale metrics and the scores. About 2 to 4 minutes (`--concurrency 2` renders fewer frames at once on a slow machine).
- **pages**: every gallery route in a real tab at 375 and 1280 px: the quality checks on the live page, first and largest paint, layout shift and long tasks (the performance monitor's measures against the limits in `js/perf-logic.js`), layout and style-recalculation counts, and what the dev console shows (console errors, uncaught exceptions, failed requests).

It writes `sweep.json`, `quality.json`, `pages.json` and `summary.md` (worst first) to `scratch/scorecard/` (git ignores it) and prints the summary. The exit code is 0 when nothing failed, 1 when the analysis found failures and 2 when the run could not finish. `site/scorecard/sweep-report.json` is not tracked (the repository ignores it; a report kept in the repository is stale after the next gallery edit). `--write-report` (a full sweep only) writes a small summary there: cells per metric and the worst item/metric groups, which the Scorecard page shows; the full failing cells stay in `scratch/scorecard/sweep.json`. With `--write-report` (full sweep) it also writes `core/site/scorecard/quality-report.json` (not tracked, an empty marker until then): the scorecard page and `mountScorecard`'s `data.quality` show it first, and the Run live button measures again in the browser (#197).

**What the sweep can and cannot see.** It measures each document's whole render tree: overflow of the page, controls and text in the page's own markup, in slotted content, and inside every OPEN shadow root, plus nested scrollers (light DOM only) and the level-1 heading count (shadow trees too). So what an element draws inside itself (a `pk-button`'s inner button, a field's help text) is checked for text size and touch targets exactly like a light-DOM control, not judged only through its host box. A *defined* toolkit element with no open shadow root (every `pk-*` element attaches one with `{ mode: 'open' }`, so this is not a normal path) is skipped and logged once per tag rather than crashing. The SDK quality checks (`js/quality.js`, the `quality` stage) also read accessible names from shadow text, and the `pages` stage runs them on the live page. Nested iframes (the gallery's sample previews) are measured by their own `sample` items, not from inside the gallery views.

## Add an element

1. Create `<tier folder>/<name>/` (`elements`, `components`, `pages` or `shells`, the folder that matches the `tier` in `<name>.meta.json`; the tag is `pk-<name>`).
2. Write `<name>.html` (the template), `<name>.css` (tokens only), `<name>.js` only if it needs behaviour, `<name>.meta.json` (the API, with examples), and `<name>.test.mjs` for logic.
3. Run `node scripts/bootstrap.mjs` (from the repository root), then `node --test .`; run the browser suite (`tests/browser/`) if an element changed.

Rules the tests enforce: no literal colours in element CSS (tokens live in `tokens/tokens.css`), no inline scripts or event handlers, every `innerHTML` use is allow-listed with its markup source, the public surface (classes, tokens,
JS exports in `site/scorecard/api.baseline.json`) only grows, and size budgets in `site/scorecard/scoring.data.js`.

