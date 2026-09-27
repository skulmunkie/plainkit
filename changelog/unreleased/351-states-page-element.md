---
type: added
issue: 351
---
`pk-states-page`: the loading, empty, error and forbidden content a page shows in place of its own, one at a time (`state`, `heading`, `description`, `label`, the `pk-retry` event) - the first of the App framework's page types (issue #351), wired into `defineModule`'s built-in `states` page type and reusable directly. `js/page-states.js` (`renderState`) is the shared, framework-free logic behind it.
