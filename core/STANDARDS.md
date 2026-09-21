# Plainkit standards

The rules every change to `core/` follows. The tests enforce most of them; this file says why.

## Names

- **Elements**: the tag prefix is `pk-`. The folder is `elements/<name>/` and the tag is `pk-<name>` (the build fails otherwise).
- **Custom properties**: design tokens are plain (`--color-*`, `--space-*`, `--text-*`, `--radius-*`, `--shadow-*`) and live only in `tokens/tokens.css`. An element's own hooks are `--pk-<element>-<part>` (for example `--pk-button-bg`) and are listed in its `.meta.json`.
- **Attributes and events**: data attributes are `data-pk-*`, events are `pk-<name>`.
- **Blazor components**: `Pk` plus the tag in PascalCase (`pk-alert` is `PkAlert`, `pk-table` is `PkTable`). The name comes from `blazor.component` in the element's meta file; parameters map one to one to the element's props and events.

## Styling

- Tokens only: no literal colours in component or element CSS, and sizes come from the space and text scales. Two themes (`data-theme="dark|light"`) and two densities (`data-density`) are token sets, never separate stylesheets.
- The page layer, `dist/plainkit.css` (`tokens/` plus `base/`: base, spacing, typography, table-content, utilities, a11y, in that cascade order), has a 10 KB gzip budget. A tool's own CSS belongs in its module folder and is loaded by the module.
- Use only components that exist in core. If something is missing, list it as a gap rather than building a one-off.

## Modules

- Each tool is a JavaScript module with one entry point, `mountX(container, options)`, that returns a small handle (`destroy()` at least). A custom element wrapper is optional and only added when it is a thin layer over the module (`<pk-gallery>`).
- Source lives in `modules/<name>/` (the gallery in `site/gallery/`); pure logic sits in `js/` so node tests can import it without a DOM.
- No new runtime dependencies. Reuse SDK components; do not rebuild them.

## The dist pattern

`node tools/build.mjs` is deterministic and writes everything generated: `plainkit.css`, the element modules, the gallery data and `dist/`. `dist/` is self-contained: every runtime URL is built from `import.meta.url`, so the folder works when copied anywhere or served from a CDN prefix. `dist/manifest.json` lists each file with an SRI hash. The build owns `dist/js`: a file there that no source produces is removed, and a test fails if one is left. Never edit generated files.

## Security (CSP)

The whole site runs under `script-src 'self'; style-src 'self'`.

- No inline scripts, inline `style` attributes, `<style>` elements or inline event handlers. Setting styles through CSSOM (`el.style.x = ...`) is fine.
- Every `innerHTML`-style sink is counted and documented in `tools/security.allow.json` with the source of its markup; prefer DOM APIs and `textContent`. Escape every dynamic value.
- No `eval`, no runtime requests to another origin.

## Files

- Every file under `core/` is CRLF (`.gitattributes`), the build emits CRLF and tests compare bytes. Never rewrite a whole file with a tool that strips carriage returns.
- A new top-level folder or file must be added to the allowed list in `tests/samples.test.mjs`.
- Nothing in `core/` may name the host application it was extracted from (`tests/carveout.test.mjs`).

## Two repositories in one: SDK and Blazor move together

`core/` (the `plainkit` npm package) and `blazor/` (the `PlainKit.Blazor` NuGet package) are versioned and released together. The Blazor package serves a byte-for-byte copy of `core/dist`. After any change to `core/`:

1. `node core/tools/build.mjs`
2. `node scripts/publish-dist.mjs` (copies `core/dist` into the package; `--check` is what CI runs)
3. Update the Blazor wrappers when an element's API changed, and run both test suites.

A change that lands in only one of the two is incomplete.

## Tests

`node --test "core/tests/*.test.mjs" "core/elements/*/*.test.mjs" "core/modules/*/*.test.mjs"` from the repository root. A change to an element source, `js/element*.js`, `js/loader.js` or a browser case needs the browser suite re-run (`tests/browser/`), because `elements-attest.test.mjs` compares it with the attested report.
