---
type: changed
issue: 295
---
`pk-app-bar-search` is now centred in the free space of a flex row such as the `pk-app-shell` header (between the nav toggle and the actions), instead of sitting right after the toggle; on a phone, or with `compact`, it stays the icon button after the toggle. The new hook `--pk-app-bar-search-align` sets its inline margin (default `auto`; `0 auto` keeps the old start alignment, `auto 0` pushes it to the end), and `--pk-app-bar-search-width` still caps its width. With a title in the shell's `title` slot the title takes the free space, so the field follows it.
