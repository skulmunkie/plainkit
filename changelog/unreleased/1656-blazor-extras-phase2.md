---
type: added
issue: 1656
---
A PlainKit.Blazor app that declares `<PlainKitExtras>` now publishes only the extras it lists (`core` chooses none): the build drops the other extras' static web assets, the package ships the `PKB001` analyzer (a warning for a component of an undeclared extra, an error under `<PlainKitStrictExtras>true</PlainKitStrictExtras>`), the declared set is logged at startup and Development fails fast when a declared extra is not served. The dev-tool wrappers count as the `tools` extra. packages.json records the published payload ceilings (`blazorPayload`).
