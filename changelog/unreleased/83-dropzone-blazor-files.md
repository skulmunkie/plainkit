---
type: added
issue: 83
---
A Blazor page can read the files picked or dropped on `PkDropzone`: put `<InputFile slot="input" OnChange=... />` in the dropzone and both the zone and the browse button end in `InputFile`'s `OnChange` with Blazor's own `IBrowserFile`s (Blazor Server and WebAssembly). A drop onto a single-file slotted input keeps the first file, and a drop without files or on a disabled zone does nothing. The Playground has an `/upload` page, and the package README and the plainkit-blazor skill (`references/file-upload.md`) describe the workflow.
