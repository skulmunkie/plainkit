---
type: added
issue: 1817
---
An optional theme is a small stylesheet in `dist/themes/<name>.css`, built from `core/themes/` and listed in the manifest; the page layer never imports it and page weight does not count it. The first one, `heading-font.css`, sets `--font-heading` to the body font.
