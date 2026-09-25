---
type: added
issue: 298
---
`pk-app-shell`: the `data-nav-toggle` control now hides and shows the side nav on a wide screen (new `nav-hidden` attribute, `navHidden` property, `NavHidden` in Blazor; the nav returns in its previous expanded or icon-rail state) and stays the drawer on a phone or tablet. The choice is remembered under the nav's `persist` key plus `:nav-hidden`, and `pk-nav-toggle` now carries `hidden` beside `open`. No host code or width checks are needed. Above 1024px the toggle no longer sets `navOpen` or the nav's `open`.
