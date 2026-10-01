---
type: fixed
issue: 774
---

`pk-accordion-item`: the actions slot is a sibling of the `<details>` again, not inside the `<summary>` (a summary has the button role, so a nested button was not reliably exposed to assistive technology). The actions are laid over the header's far end and keep the phone touch target, the `actions` part and the slot are unchanged.
