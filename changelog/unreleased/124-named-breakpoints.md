---
type: added
issue: 124
---
Named breakpoints: `core/tokens/breakpoints.json` is the one source of the widths (`phone` 640, `tablet` 1024, `wide` 1280), element CSS can write `@media (--phone)` (width at or below the breakpoint) or `@media (--above-phone)` (width above it), including combined forms such as `(--phone) and (orientation: portrait)`, and the build resolves them to real queries with no runtime cost; an unknown name fails the build. `plainkit.css` now also defines `--pk-bp-phone`, `--pk-bp-tablet` and `--pk-bp-wide` on `:root` for scripts and documentation.
