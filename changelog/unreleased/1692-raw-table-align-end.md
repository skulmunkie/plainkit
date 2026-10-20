---
type: fixed
issue: 1692
---
The consumer audit rule S3 (`class=`) no longer flags the `num` class on a `th` or `td`, the one class a raw `pk-table` uses to right-align a numeric cell with tabular figures, so a correct raw table can reach zero findings. Any other class is still flagged.
