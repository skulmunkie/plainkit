---
type: fixed
issue: 1982
---
pk-date-range-picker keeps its start and end date fields at least 9.3rem wide, so on a phone the whole year (09/08/2026) shows next to the picker icon instead of being clipped to 09/08/202; the calendar button wraps to the next line when the row is too narrow.
