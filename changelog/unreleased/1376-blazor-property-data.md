---
type: added
issue: 1376
---
Blazor: `PkCommandPalette.Items` (`PkCommandPaletteItem`), `PkLightbox.Items` (`PkLightboxItem`) and `PkCodeView.Segments` (`PkCodeSegment`) give the data these elements take only as a JavaScript property, so a Blazor palette no longer opens empty. The generator has a new mapping kind, `"map": "property"`, that sets the property through the bridge after each render in which the value changed.
