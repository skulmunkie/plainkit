---
type: fixed
issue: 341
---
A pk-field marks its control invalid, and sets its label and messages, even when the control (a pk-input, pk-select, or any pk-* element) is defined after the field: the field waits for the control to upgrade instead of falling back to a plain aria-invalid attribute.
