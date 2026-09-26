---
type: changed
issue: 350
---
`mountRouter` moves from `modules/router/router.js` to `js/router.js`: `mountApp` needs it at runtime and the modules unit is not part of the runtime. Import it as `import { mountRouter } from './plainkit/js/router.js'`; the old path is gone (it was never shipped in `dist`).
