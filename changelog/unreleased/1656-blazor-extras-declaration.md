---
type: added
issue: 1656
---
PlainKit.Blazor can declare which optional parts an app uses: `<PlainKitExtras>canvas;dock</PlainKitExtras>` in the project file or `AddPlainKit(o => o.Extras.Add(PkExtra.Canvas, PkExtra.Dock))` (nothing declared still means everything). The components of the canvas, dock and markdown packages carry `[PkRequiresExtra]`, the runtime hands the declared list to the browser, and a tag of an undeclared extra on the page logs one error naming the fix. Phase 1 of the Blazor option model: the build does not yet drop the undeclared extras' files.
