---
type: breaking
issue: 710
---
The undocumented chrome-token families `--te-*`, `--sc-*`, `--ce-*`, `--gd-*`, `--lb-*`, `--gx-*`, `--gal-pv-*` and `--gal-shell-*` (sizes for the theme editor, scorecard, code explorer, guides, layout builder and gallery pages) are renamed with the reserved private prefix, for example `--te-border-w` becomes `--_te-border-w`; they are internal and not public tokens. Migration: nothing to do unless your CSS read one of the old names, in which case use your own value instead.
