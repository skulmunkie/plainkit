---
title: Size comparison
order: 12
summary: What the same page (a validated form, a sortable paged table and a dialog) costs on a cold load in Plainkit, Lit, Svelte, Vue, React, Angular, Shoelace and Blazor, measured in bytes over the wire, with the versions and a one-command way to repeat it.
---

The question is simple: for one ordinary page, how many bytes does a visitor download? The repository carries a small benchmark, `bench/size-comparison/`, that builds the **same page** in several stacks with each stack's normal production tooling, loads each one cold in headless Chrome and counts every file the page requests. This guide is its result. The numbers are what the benchmark measured, including where Plainkit is larger.

## The page

"Team directory", the same in every implementation:

- A form with Name (required), Email (required, must look like an address) and Role (a select), validated on submit with the same two messages.
- A table of 25 members, sortable on two columns, 5 rows per page, with Previous, "Page 1 of 5" and Next.
- A dialog ("Delete the list?" with Cancel and Delete).

## Results

Measured on `main` at the time of writing (the exact versions of Plainkit and of every tool are recorded in `bench/size-comparison/results.json`). Sizes in KB (1 KB = 1024 bytes) of a cold load with the cache disabled: the HTML plus every JS, CSS, font and other file the page requests. Compressed offline (gzip level 9, brotli quality 11); headers are not counted.

| Stack | Requests | JS (brotli) | CSS (brotli) | Total gzip | Total brotli |
| --- | ---: | ---: | ---: | ---: | ---: |
| Lit 3.3 | 3 | 6.3 | 0.2 | 7.5 | 6.7 |
| Svelte 5.57 | 3 | 13.2 | 0.2 | 15.0 | 13.5 |
| Vue 3.5 | 3 | 23.2 | 0.2 | 26.0 | 23.6 |
| Plainkit, one page bundle | 10 | 21.3 | 5.7 | 31.2 | 27.5 |
| Plainkit, per element | 26 | 26.4 | 5.7 | 37.5 | 32.6 |
| Angular 22 | 3 | 35.5 | 0.2 | 40.1 | 36.0 |
| Shoelace 2.20 | 3 | 35.3 | 2.7 | 46.1 | 38.1 |
| React 19 | 3 | 58.0 | 0.2 | 67.9 | 58.3 |
| Plainkit, `mountApp` | 72 | 78.6 | 5.7 | 96.9 | 84.4 |
| Blazor Server, sample app | 52 | 105.0 | 6.1 | 134.6 | 116.3 |
| Blazor WebAssembly, sample app | 88 | 148.9 | 6.1 | 3574.7 | 2876.8 |

How to read it:

- **Plainkit is not in the Lit and Svelte range for this page.** Per element it costs about five times Lit and two and a half times Svelte, a little more than Vue and about the same as Angular and Shoelace, and less than React. Its 5.7 KB stylesheet (brotli) is the design tokens and the base styles, which the framework pages mostly do not have: they use a shared 0.7 KB layout stylesheet and native controls, so they are plainer on screen.
- **The page is fixed, the stack is not.** A framework's size is a floor that your own code grows. Plainkit's grows by the elements you add: each element is its own file (the average is 1.6 KB gzip; button 2.6, input 3.7, table 4.0), and the page above uses eight.
- **Per element vs one bundle.** Per element downloads 26 small files (a graph of ES modules, no build step). The page bundle (`core/tools/bundle-page.mjs`) is 10 requests and 7 KB lighter: one file compresses better than many, and the code the elements load on demand (a table's editing and column resizing, the log toast output) stays in lazy chunks that are not downloaded until used.
- **`mountApp` is a different page.** It draws a whole app (shell, router, breadcrumb, search, side nav, a list page and a record page, the framework's confirm dialog), so its 84 KB is what an app costs, not what this page costs. It is unbundled (72 requests).
- **Blazor rows are not the same page.** They are the first load of the repository's own sample apps (an app shell with one page), the cost of getting a Blazor app running. WebAssembly downloads the .NET runtime (2.7 MB brotli, without the `wasm-tools` workload, so no AOT and no native relink); Server downloads only the framework script and Plainkit's files, and then keeps a WebSocket circuit open (a few KB to draw the first page; it is not in the table).

## What each page uses

| Stack | Page built with |
| --- | --- |
| Plainkit, per element | `pk-stack`, `pk-field`, `pk-input`, `pk-select`, `pk-button`, `pk-table` (manual mode: the host sorts and pages), `pk-cluster`, `pk-dialog`; `initPlainkit()` with the recommended `modulepreload` hints, no build, the page's own script not minified |
| Plainkit, one page bundle | the same markup, bundled and minified by `core/tools/bundle-page.mjs` |
| Plainkit, `mountApp` | a module with a `list` page type and a `record` page type |
| Lit, Svelte, Vue, React, Angular | native HTML controls, one component, Vite 8 (Angular: its own application builder), minified production builds |
| Shoelace | `sl-input`, `sl-select`, `sl-button`, `sl-dialog` imported one by one; a native table, since Shoelace has none |

## Repeat it

```bash
node scripts/bootstrap.mjs
cd bench/size-comparison
npm install
node run.mjs
```

It needs Chrome, Chromium or Edge, and the .NET SDK for the two Blazor rows. It writes `results.json` (every file of every page, with raw, gzip and brotli sizes, and the exact versions) and `results.md`. The benchmark is not part of the npm or NuGet package and does not run in CI or `verify`. Its README lists the build of each page and what is and is not counted.
