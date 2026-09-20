# Plainkit

A dependency-free UI toolkit: plain HTML, CSS custom properties and small ES modules, with custom elements (`pk-*`)
for the controls that need behaviour. No framework, no build step to use it, no runtime requests to anything but its own files.

It ships in two forms from one repository:

| Package | What it is | Where |
|---|---|---|
| `plainkit` | The vanilla toolkit: `dist/` (CSS, modules, elements, gallery, tools) | npm, or any CDN that serves npm |
| `Plainkit.Blazor` | The Blazor port: typed components over the same elements, with `dist/` as static web assets | NuGet (moves here after the toolkit) |

## Layout

```
core/      the vanilla toolkit: source, tests, tools, gallery; its only output is core/dist
blazor/    Plainkit.Blazor (Razor class library), generated wrappers and their bUnit tests (added later)
scripts/   the bridge between the two (publish core/dist into blazor, regenerate wrappers) (added later)
```

Try it: `node core/tools/serve.mjs` serves the gallery, theme editor and scorecard on http://localhost:5310/ (Node only).

## Status

Pre-release. The toolkit is here; the Blazor port follows. See `core/HANDOFF.md` for what is built and what is left.

## Licence

MIT. See [LICENSE](LICENSE).
