---
type: notes
issue: 1386
---
Blazor parity: the intentionally skipped wrapper parameters were re-decided now that lifecycle events, methods, property data and bind exist. All stay out (PkTooltip LoadAsync, OnClick, DocLink and ExternalLink; PkDialog CloseButtonLabel; PkAppShell ShowErrorOverlay; PkDrawer IsLoading, Backdrop and PhoneCards) because the elements have no matching feature; PkTooltip OnShow (pk-show) covers the lazy load. Each mapping note records the reason.
