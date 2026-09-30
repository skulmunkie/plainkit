---
type: added
issue: 678
---
A new built-in app page type, `note` (`pk-note-page`), for a static informational page: a heading and a block of prose in a card, no data callbacks and no item collection. Use `{ path, page: 'note', config: { heading, body, cardHeading? } }` for an About/Overview/Summary-style route instead of hand-rolling it with `page: 'custom'`.
