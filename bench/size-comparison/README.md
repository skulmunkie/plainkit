# Size comparison (issue #979)

The same page built in Plainkit and in other stacks, loaded cold in headless Chrome, with the bytes of every file it requests counted (gzip level 9 and
brotli quality 11, compressed offline from the built files; response headers are not counted). The published table is the guide
`core/site/guides/content/size-comparison.md`; the raw numbers and every file of every page are in `results.json`, the table in `results.md`.

This folder is **not** part of the npm package, the NuGet package, CI or `node scripts/verify.mjs`. It has its own `package.json` with exact versions.

## Run it

```bash
node scripts/bootstrap.mjs            # once, from the repository root: the Plainkit pages read core/dist
cd bench/size-comparison
npm install                           # the pinned build tools (Vite, Svelte, Vue, React, Lit, Angular, Shoelace)
node run.mjs                          # build every page into out/, measure it, write results.json and results.md
node run.mjs --only react,vue         # some pages (the other rows of results.json are kept)
node run.mjs --no-build --shots       # measure what is in out/ again; --shots also saves out/shots/<page>.png
```

Needs Chrome, Chromium or Edge (`PK_CHROME` names it, as for the other benches) and, for the two Blazor rows, the .NET SDK. `out/` and `node_modules/` are git-ignored.
Bytes are deterministic: a second run gives the same numbers.

## What the page is

"Team directory", the same in every implementation (`shared/rows.js` holds the data, the messages and the sort/page function):

- A form: Name (required, "Enter a name."), Email (required, must look like an address, "Enter a valid email address."), Role (select: Engineer, Designer, Manager) and an
  "Add member" button. Validation runs on submit; a valid submit shows "Saved <name>.".
- A table of 25 members (Name, Role, Score), sortable on Name and Score (ascending, descending, off), 5 rows per page, with Previous, "Page 1 of 5" and Next.
- A dialog: "Delete list" opens "Delete the list?" with Cancel and Delete.

After the page shows its first rows the harness waits 0.8 s, takes the request list (the cold load), then clicks Next and checks "Page 2 of 5" (so every page is proven to work, but
what that click fetches is not counted).

## The pages

| Id | Stack and build | Notes |
| --- | --- | --- |
| `plainkit-elements` | Plainkit loaded per element: `initPlainkit()` from `core/dist`, no build, the page's own `app.js` and `rows.js` as written (not minified) | the recommended wiring of the Getting started guide, with its four `modulepreload` hints; `pk-stack`, `pk-field`, `pk-input`, `pk-select`, `pk-button`, `pk-table` (manual), `pk-cluster`, `pk-dialog` |
| `plainkit-bundle` | Plainkit as one page bundle: `core/tools/bundle-page.mjs` (esbuild, minified) plus the page code minified with the same esbuild | the same markup, 10 requests: the entry, the chunks it shares with the lazy code, the stylesheet (code the elements load on demand stays a lazy chunk) |
| `plainkit-app` | Plainkit `mountApp`: a module with a `list` page (sortable columns, 5 per page, a bulk "Delete list" action that opens `ctx.dialogs.confirm`) and a `record` page (the form, with `save` returning the errors); unbundled | a different page by construction: the app shell, router, breadcrumb, search box and side nav come with it, the form is a second route (`#/team/members/new`), and the dialog is the framework's confirm. It is what an app costs, not what the same page costs |
| `lit` | Lit 3, Vite 8 production build (esbuild minify), one `LitElement` in the light DOM | |
| `svelte` | Svelte 5 (runes), Vite 8 with `@sveltejs/vite-plugin-svelte` | |
| `vue` | Vue 3 single-file component (`<script setup>`), Vite 8 with `@vitejs/plugin-vue` | |
| `react` | React 19 (`react-dom/client`), Vite 8 with `@vitejs/plugin-react` | |
| `angular` | Angular 22 standalone component, signals, `@angular/build:application` with its production defaults (AOT, optimisation, output hashing), no zone.js, no router or forms module | |
| `shoelace` | Shoelace 2 web components (`sl-input`, `sl-select`, `sl-option`, `sl-button`, `sl-dialog`), imported per component, plain JS, Vite 8; the table is a native `<table>` because Shoelace has none | the light theme stylesheet is the CSS |
| `blazor-wasm` | `dotnet publish -c Release` of `blazor/samples/PlainKit.AppSample.Wasm`, served as static files | **not the same page**: the repository's sample app (app shell, note page). It is the first-load floor of a Blazor WebAssembly app with PlainKit.Blazor; the `wasm-tools` workload is not installed, so no AOT and no native relink |
| `blazor-server` | `dotnet publish -c Release` of `blazor/samples/PlainKit.AppSample`, run in Production behind a logging proxy | **not the same page**: the sample app. Counts the static files and the HTML; the circuit (WebSocket) traffic is recorded separately as `circuitBytes` in `results.json`, not in the table |

The non-Plainkit, non-Shoelace pages share `shared/page.css` (about 0.7 KB of layout) so they are not unstyled; Plainkit brings its own tokens and element styles, Shoelace its theme.
None of the pages loads a font (Plainkit and the shared CSS use the system font stack).

## What the numbers do and do not include

- Counted: the HTML document, every JS, CSS, font, icon and JSON file the page requests during its cold load. Not counted: response headers, TLS, HTTP framing, the favicon, WebSocket frames.
- Compressed offline, not by a server, so they are the best case a good CDN gives. Real servers often use a lower brotli level.
- The Plainkit "per element" row downloads 26 files as a graph of ES modules; its byte count is low but the request chain is deep (see `scripts/bench/load.mjs` for the timing).
  The page bundle splits the code the elements load on demand (a table's editing, column resize...) into lazy chunks, so the cold load is the entry plus its shared chunks: 10 requests and about 7 KB lighter than per element.
- Framework rows are a single tiny component, so they show the framework's floor. A real app's own code grows them; Plainkit's per-element cost grows by the elements you add (an element file averages 1.6 KB gzip; button is 2.6, input 3.7, table 4.0).
- No time measurements: wall-clock numbers are noisy; see `scripts/bench/wire.mjs` for those.

Versions are in `package.json` (exact) and `results.json` (`meta` and each row's `versions`).
