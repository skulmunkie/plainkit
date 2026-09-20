# Plainkit

A dependency-free UI toolkit: plain HTML, CSS custom properties and small ES modules, with custom elements (`pk-*`)
for the controls that need behaviour. No framework, no build step to use it, no runtime requests to anything but its own files.

It ships in two forms from one repository:

| Package | What it is | Where |
|---|---|---|
| `plainkit` (`core/dist`) | The vanilla toolkit: CSS, modules, elements, gallery, tools | GitHub Pages, GitHub releases, jsDelivr by tag (npm is optional) |
| `PlainKit.Blazor` | Blazor components over the same elements, the dev tools page, and `dist/` as static web assets | NuGet |

## Use it

No install, no build step: link the files.

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/skulmunkie/plainkit@v0.1.0/core/dist/plainkit.min.css">
<script type="module" src="https://cdn.jsdelivr.net/gh/skulmunkie/plainkit@v0.1.0/core/dist/plainkit.js"></script>
<pk-alert kind="info" heading="It works">No framework, no build.</pk-alert>
```

| Way | Version |
|---|---|
| The Pages site, `https://skulmunkie.github.io/plainkit/` (gallery and tools; `dist/` sits under it) | latest `main` |
| jsDelivr from a git tag, as above (change `v0.1.0` to any release) | pinned |
| `plainkit-dist-<version>.zip` on the [GitHub releases](https://github.com/skulmunkie/plainkit/releases) page; copy it anywhere | pinned |
| `dotnet add package PlainKit.Blazor` | pinned |

The SDK itself makes no third-party requests at run time; a CDN is only one way to deliver its files. `dist/manifest.json` lists every file with a SRI hash. How releases are made is in [PUBLISHING.md](PUBLISHING.md).

## Layout

```
core/      the vanilla toolkit: source, tests, tools, gallery; its only output is core/dist
blazor/    PlainKit.Blazor (src/, a Razor class library), its bUnit tests (tests/) and a host app (samples/)
scripts/   the bridge between the two: publish-dist.mjs copies core/dist into the package (--check in CI)
```

Try it: `node core/tools/serve.mjs` serves the gallery, theme editor and scorecard on http://localhost:5310/ (Node only).

## Status

Pre-release. The toolkit is here; the Blazor port follows. See `core/HANDOFF.md` for what is built and what is left.

## Licence

MIT. See [LICENSE](LICENSE).
