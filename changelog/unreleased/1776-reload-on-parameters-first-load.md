---
type: fixed
issue: 1776
---
PkComponentBase and PageBase run the first OnLoadAsync even when ReloadOnParameters is overridden to false; the flag now only stops reloads after a parameter change, as documented.
