---
type: changed
issue: 423
---
The list, record, dashboard, settings, wizard, workspace and master-detail pages draw their title bar through pk-page-shell, so the page header, its spacing and an empty header are the shell's. The pk-page-header now sits in the shell's shadow tree inside each page's `header` part; the breadcrumb, actions and title are slotted children of that part.
