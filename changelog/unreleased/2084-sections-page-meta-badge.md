---
type: added
issue: 2084
---
`pk-sections-page` has a `meta` slot for a line under the title (Blazor: `MetaContent`). A `config.badges` entry with an `id` and `popover: true` (or `{ heading }`) becomes a `pk-badge-popover` whose panel is the child with `slot="badge-<id>"` (Blazor: `BadgePopoverContent`). Reassigning `config.newAction` or `config.actions` redraws the primary action and the actions per page state.
