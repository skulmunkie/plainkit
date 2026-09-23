---
type: removed
issue: 229
---
`core/base/utilities.css` drops 107 of its 121 literal-value utility classes (undocumented, never referenced by any SDK page, sample or component — leftover debris from an inline-style-to-class migration); the page-level stylesheet shrinks by about 750 bytes gzip. A page that used one of these classes on its own markup needs to replace it with an equivalent rule in its own stylesheet; `u-contents`, `u-sr-only` and the dozen other classes with a real caller in the SDK are unaffected.
