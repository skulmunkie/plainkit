---
type: fixed
issue: 201
---
`pk-image-gallery`'s add tile takes an `input` slot the same way `pk-dropzone` does (issue #83): put a real `<input type="file">` (in Blazor, `<InputContent><InputFile OnChange="..." /></InputContent>`) there and the tile's picker opens it directly, so Blazor reads real file bytes through `IBrowserFile` instead of only ever getting a chosen file's name.
