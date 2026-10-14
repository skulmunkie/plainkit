---
type: changed
issue: 1253
---
`dist/gallery` (the embeddable gallery: `embed.html`, its modules, data and templates) is no longer in the npm package, 270 KB smaller packed (1,346,287 to 1,076,288 bytes) and 1.05 MB smaller unpacked. It is still generated into `dist/`, so it stays in the release zip `plainkit-dist-<version>.zip`, on the Pages site at `https://skulmunkie.github.io/plainkit/dist/gallery/embed.html`, and in the PlainKit.Blazor static web assets. Migration for `<pk-gallery>` on an npm install: set its `src` attribute to a hosted `embed.html` (the Pages URL, or a copy of `dist/gallery` from the release zip); a frame that never answers now shows a notice saying so instead of an empty box. The skills' templates reference gives the same locations. Refs #1253.
