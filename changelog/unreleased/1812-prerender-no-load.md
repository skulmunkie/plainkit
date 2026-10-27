---
type: fixed
issue: 1812
---
`PageBase` no longer starts `OnLoadAsync` during the static prerender of an interactive page (`PkComponentBase`, which the framework's own route guard uses, still loads while prerendering). The prerender did not wait for it, so the load kept running after the request scope was disposed (a disposed DbContext) and ran again when the circuit connected; now the prerendered HTML shows the loading state and the interactive render loads once. Pages with no render mode (static SSR) load as before.
