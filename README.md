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
<script type="module">
  import { initPlainkit } from 'https://cdn.jsdelivr.net/gh/skulmunkie/plainkit@v0.1.0/core/dist/plainkit.js';
  initPlainkit();
</script>
<pk-alert kind="info" heading="It works">No framework, no build.</pk-alert>
```

| Way | Version |
|---|---|
| The Pages site, `https://skulmunkie.github.io/plainkit/` (gallery and tools; `dist/` sits under it) | latest `main` |
| jsDelivr from a git tag, as above (change `v0.1.0` to any release). A range follows the newest matching tag: `@0.1` is the latest `0.1.x`, `@1` the latest `1.x.y` | pinned, or a range |
| `plainkit-dist-<version>.zip` on the [GitHub releases](https://github.com/skulmunkie/plainkit/releases) page; copy it anywhere | pinned |
| `dotnet add package PlainKit.Blazor` | pinned |

The SDK itself makes no third-party requests at run time; a CDN is only one way to deliver its files. `dist/manifest.json` lists every file with a SRI hash. How releases are made is in [PUBLISHING.md](PUBLISHING.md).

## Layout

```
core/      the vanilla toolkit: source, tests, tools, gallery; its only output is core/dist
blazor/    PlainKit.Blazor (src/, a Razor class library), its bUnit tests (tests/) and a host app (samples/)
scripts/   the bridge between the two: publish-dist.mjs copies core/dist into the package (--check in CI); generate-blazor.mjs writes the Pk* components;
           build-skills.mjs writes the agent skills into core/dist/skills (--check in CI)
```

Try it: `node core/tools/serve.mjs` serves the gallery, theme editor and scorecard on http://localhost:5310/ (Node only).

## Agent skills

`plainkit-skills` is a bundle of two skills for developer agents that build their own apps on Plainkit: `plainkit-sdk` (the `pk-*` elements, page templates, patterns, tool modules, logging, theming) and `plainkit-blazor` (the `Pk*` components, options, the `ILogger` bridge, dev tools). Each is a short `SKILL.md` plus `references/*.md`: plain markdown generated from the same sources as the toolkit (the element API, the Blazor mappings, the sample folders, the tool modules), with every code sample tested, so the skills cannot drift from what ships. They carry the version of the release.

- **Claude Code:** copy the skill folders (`plainkit-sdk/`, `plainkit-blazor/`) into `.claude/skills/` of your project, or into `~/.claude/skills/` to use them everywhere. You get them from the `plainkit-skills-<version>.zip` on the [GitHub releases](https://github.com/skulmunkie/plainkit/releases) page (unzip it there), from `skills/` inside `plainkit-dist-<version>.zip`, from `core/dist/skills/` in a clone, or from `_content/PlainKit.Blazor/plainkit/skills/` in an app that references PlainKit.Blazor.
- **Any other agent:** the references are plain markdown, so point the agent at the files under `references/`. Start with `elements-index.md` (SDK) or `components-index.md` (Blazor); each file names the next one to open.
- **Maintainers:** `node scripts/build-skills.mjs` regenerates them after `node core/tools/build.mjs` and `node scripts/generate-blazor.mjs`; `--check` fails when they are stale (CI runs it). Exports to other agent formats are tracked in issue #36.

## Status

Pre-release. The toolkit is here; the Blazor port follows. See `core/HANDOFF.md` for what is built and what is left.

## Licence

MIT. See [LICENSE](LICENSE).
