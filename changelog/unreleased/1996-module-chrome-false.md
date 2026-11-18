---
type: added
issue: 1996
---
An app module can set `chrome: false` in `defineModule`: while it is active the shell draws no bar, menu, breadcrumb or footer and the module owns the whole viewport (it draws its own way back). The gallery's Layout builder uses it, so the builder fills the window with its palette, canvas and properties and no gallery chrome around it; `mountLayoutBuilder` still mounts the same builder in any host.
