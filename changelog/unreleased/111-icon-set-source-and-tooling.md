---
type: added
issue: 111
---
The icon sprite (`core/icons.svg`) is now generated from individual sources under `core/icons/src/` by a new, dependency-free `core/icons/build.mjs` (wired into `node scripts/bootstrap.mjs`), which lints every icon (24x24 viewBox, `currentColor` only, no ids, no scripts or styles, a size limit) and adds a typed name list (`core/icons/icons.json`, `core/icons/icons.d.ts`). The design language is written up in `core/icons/README.md`. 27 new icons cover gaps found by auditing what `pk-icon` and `pk-button icon-name` already need: navigation (`chevron-right`, `chevron-up`, `chevron-down`, `arrow-left`, `arrow-right`, `external-link`, `more`), actions (`copy`, `download`, `refresh`, `filter`, `sort`, `share`, `save`, `eye`, `eye-off`), status (`success`, `warning`, `error`, `info`, `help`, `lock`, `bell`) and objects (`user`, `calendar`, `clock`, `mail`) - 66 icons in total, all existing names and their visual style unchanged.
