---
type: changed
issue: 805
---
`PkListPage<TItem>` is now generated from its mapping instead of hand-written (the generator gained `typeparam` and a callback result expression). Its parameters (`Config`, `Load`, `OnSelect`, `OnBulk`), their types and its namespace are unchanged.
