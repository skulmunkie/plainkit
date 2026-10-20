---
type: changed
---
The shipped page layer and loader are lighter: dev-tool chrome tokens and a few leftover flyout and button tokens that nothing reads are no longer in `plainkit.css`, the element loader drops its registry-fetching branch, `init.js` carries its version instead of fetching `version.js`, and generated elements omit `delegatesFocus` and `formAssociated` when false. About 300 bytes gzip less on the form and table reference pages, and one request fewer.
