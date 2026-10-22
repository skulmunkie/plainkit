---
type: fixed
issue: 1733
---
`PkLink` with only `Href` navigates again: an unset `To`, `Target`, `Rel` or `Download` leaves its attribute off the host, where an empty `download` made every click download the target.
