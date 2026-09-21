---
type: fixed
issue: 69
---
White text on the primary button, badge, selected-day, current-page, step, segmented and tag fills now measures at least 4.5:1 in both themes (dark was 3.18:1): fills use the new `--color-accent-fill` and `--color-accent-fill-hover` tokens, while `--color-accent` stays for text, borders and focus. The light theme is unchanged.
