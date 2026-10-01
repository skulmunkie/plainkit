---
type: breaking
issue: 764
---
`pk-card` no longer renders loading, empty or error states: the `state` attribute, `stateHeading`, `stateDescription`, the `retry` callback and the `state` part are removed, and Blazor `PkCard` loses `State`, `StateHeading` and `StateDescription`, so the card renders no other element. Migrate by drawing the state into the card body yourself, for example `const box = document.createElement('div'); card.replaceChildren(box); showState(box, 'error', { error: err, retry: () => reload() });` with `showState` from `js/page-shell.js` (before: `card.retry = reload; card.state = 'error'`); `pk-dashboard-page` already does this for its widgets, which look the same as before.
