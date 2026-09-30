---
type: changed
issue: 736
---
`pk-date-range-picker` now draws its two date fields as `pk-input type="date"`, its quick ranges as toggle `pk-button`s and its layout with `pk-stack`, `pk-cluster` and `pk-text`, and `pk-app-bar-search` draws its expand and close buttons as icon `pk-button`s; both look and behave as before. The picker's `--pk-control-bg`, `--pk-control-border` and `--pk-control-radius` hooks are no longer declared on it (set them on the picker or an ancestor and the inner `pk-input` still reads them), and `pk-app-bar-search` no longer documents the `expand-icon` and `collapse-icon` parts (the icons now live inside the buttons).
