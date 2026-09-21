---
type: added
issue: 57
---
The gallery's Details drawer takes sections from its host, as plain text data (`sections` on `mountGallery` and on `pk-gallery`, sent to the gallery's frame by message once it says it is ready), and `pk-gallery src` resolves a relative address against the document's base URI, so it works on routed pages. PlainKit.Blazor's `/_plainkit` gallery shows the Blazor section (component, parameters, Razor) in the drawer; `PkGallery` gains `Sections` and `PkGallerySection.ForBlazor()`.
