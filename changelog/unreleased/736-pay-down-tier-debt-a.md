---
type: changed
issue: 736
---
`pk-date-range-picker` now draws its two date fields as `pk-input type="date"`, its quick ranges as toggle `pk-button`s and its layout with `pk-stack`, `pk-cluster` and `pk-text`; `pk-app-bar-search` draws its expand and close buttons as icon `pk-button`s. The API is unchanged: the picker's `--pk-control-bg`, `--pk-control-border` and `--pk-control-radius` hooks still drive its fields, and `expand-icon` and `collapse-icon` are still parts of the search field. The one visible difference is the picker's quick-range pills: their labels now take `pk-button`'s text size and medium weight (before: the smaller meta size, regular weight), so the pills are a little larger and bolder.
