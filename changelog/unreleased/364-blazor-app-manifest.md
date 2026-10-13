---
type: added
issue: 364
---
The module manifest, the data part of an app module, has a JSON schema (`js/app/manifest.schema.json`), a `readManifest` validator that shares `defineModule`'s checks, and generated C# records (`PkModuleManifest.FromJson`). First step of the Blazor app framework; no Blazor behaviour yet.
