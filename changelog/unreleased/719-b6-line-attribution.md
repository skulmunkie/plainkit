---
type: fixed
issue: 719
---
The audit's Razor/HTML scanner no longer desyncs on a quoted attribute value that reuses its own quote character inside an `@(...)` expression (for example `Class="@(IsLoading ? "spin" : "")"`), which could leak the rest of the value into bogus markup and make `B6` misattribute a `<script>` finding to an unrelated self-closing component, inline `<svg>`, or `javascript:` href line.
