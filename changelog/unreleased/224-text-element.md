---
type: added
issue: 224
---
New `pk-text` element (`PkText` in Blazor): a themed paragraph, or with `inline` a run of text inside a line, so body text no longer needs a `<p>` or `<span>` with a class. `variant` gives it a heading look (`h1` to `h6`), `lead` or `eyebrow`; `font` picks `sans` or `mono`; `size`, `tone` and `weight` take the type-scale and theme colours and override the variant; `truncate` keeps it to one line. A block is exposed as a paragraph. Real headings stay native `h1` to `h6` on purpose: the heading variants are a look only. New tokens `--text-h1` to `--text-h6` and `--font-mono`; native headings now size from the same scale (unchanged at the root, except `h5` and `h6`, which no longer drop below the `--text-meta` floor). The gallery samples, the tool layout and the settings page use it.
