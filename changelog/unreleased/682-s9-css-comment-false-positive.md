---
type: fixed
issue: 682
---
The conformance audit's S9 rule (literal design values) no longer flags a number-with-unit inside a CSS comment as if it were a real value; it scans comment-stripped CSS instead of raw file text.
