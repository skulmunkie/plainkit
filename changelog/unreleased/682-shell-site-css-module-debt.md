---
type: notes
issue: 682
---
No visible effect: `core/site/site.css` routes its literal `72rem`/`14rem`/`1px` values through new `--site-*` tokens in `core/tokens/tokens.css`, paying down module-ruleset baseline debt (#682).
