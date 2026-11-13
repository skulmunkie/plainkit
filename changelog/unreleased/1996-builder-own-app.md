---
type: changed
issue: 1996
---
The layout builder is an app of its own: `site/builder/index.html` fills the whole window with its palette, canvas and properties, with no gallery bar, breadcrumb or scrolling section frame around it and a link back to the gallery. The gallery's Layout builder page is now only the way to it; `mountLayoutBuilder` still mounts the same builder in any host.
