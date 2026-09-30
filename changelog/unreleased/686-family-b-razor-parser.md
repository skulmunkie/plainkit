---
type: fixed
issue: 686
---
The conformance-audit CLI's B3 rule no longer misreads Blazor's `@bind-X:get`/`:set`/`:after` syntax, a generic component's `TItem="..."` type parameter, or a non-ASCII character inside a quoted attribute value as an unknown component parameter. B1 (a raw tag with a `pk-*` equivalent) is removed; it duplicated the existing D1 rule, which already covers `.razor`/`.cshtml` files.
