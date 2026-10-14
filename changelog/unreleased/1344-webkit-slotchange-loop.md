---
type: fixed
issue: 1344
---
Pages no longer freeze in WebKit (Safari, iOS): an element writes a text or attribute binding only when its value changed, so fallback text inside a watched slot (the heading of `pk-empty-state` and `pk-field-list`, captions, empty text) no longer re-fires `slotchange` in an endless render loop.
