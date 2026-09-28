---
type: added
issue: 486
---
`pk-card` has a `state` (`ready`, `loading`, `empty`, `error`) that swaps its body for a built-in skeleton, empty state or error alert, with `stateHeading`, `stateDescription` and a `retry` callback for the error state; the heading, actions and footer stay, and a card without `state` is unchanged.
