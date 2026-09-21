---
type: fixed
issue: 124
---
`tokens.css` ended with one closing brace too many. In `dist/plainkit.css`, which joins the token sheet and the base sheet, the browser read that brace as the start of the next rule and dropped it: the base `* { box-sizing: border-box }` rule was lost for every page that loads `dist/plainkit.css` (the Blazor package and the release zip). The stray brace is removed, and a test now fails when any page-layer stylesheet has unbalanced braces.
