---
type: fixed
issue: 1458
---
Blazor `PageBase` can name the parameters that mean another record: override `ReloadParameters` (null keeps today's rule, any changed parameter; empty loads once) so a `?tab=` or filter query parameter no longer restarts `OnLoadAsync` and flips `IsLoading`. Moving the address-bar query without a router navigation for a page's own `PkTabs` is tracked separately.
