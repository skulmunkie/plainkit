---
type: added
issue: 346
---
A module route can be `persist: true`: `mountApp` builds its page once and keeps it, hidden, while another route shows, then shows the same page again on return (scroll position, typed text and loaded data survive). The kept page is freed when the module is left, and rebuilt when the route returns with other params.
