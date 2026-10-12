---
type: fixed
issue: 1188
---
A component's shadow template is bound before it is attached, so child elements such as pk-grid and pk-button no longer log warnings about an unresolved `{{placeholder}}` attribute.
