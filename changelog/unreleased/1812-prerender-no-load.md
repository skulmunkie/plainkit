---
type: fixed
issue: 1812
---
`PageBase` and `PkComponentBase` no longer start `OnLoadAsync` during the static prerender of an interactive page. The prerender did not wait for it, so the load kept running after the request scope was disposed (a disposed DbContext) and ran again when the circuit connected; now the prerendered HTML shows the loading state and the interactive render loads once. Pages with no render mode (static SSR) load as before.
