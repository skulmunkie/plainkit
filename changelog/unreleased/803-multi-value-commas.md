---
type: fixed
issue: 803
---
A multiple pk-select and pk-tag-input keep values that contain a comma: the comma-joined value escapes it as a backslash and a comma, so such values survive set, get and change events. Values without a comma or backslash are unchanged.
