---
type: breaking
issue: 77
---
`PkChart.Data` is a `PkChartData?` and `PkImageGallery.Images` an `IReadOnlyList<PkGalleryImage>?` instead of `object?`, so the compiler checks what you pass; a caller that passed an anonymous object or another shape must now build the record (a `List<PkGalleryImage>` or a `PkChartData` still compiles). The attribute sent to the element is unchanged, byte for byte. The generator uses the type a mapping names for a JSON prop when the package declares it, and lists a JSON prop without a type under `typesToDefine` in the manifest (none is left).
