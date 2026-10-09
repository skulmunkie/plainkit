---
type: fixed
issue: 402
---
The detail layout and the doc page space their stacked parts evenly: the detail layout's sidebar uses the same gap as its main column and drops a slotted child's own margin, and the doc page puts one gap (--space-4) between the breadcrumb, title, summary, body and pager, so the SDK Scorecard no longer reports inconsistent gaps for them.

