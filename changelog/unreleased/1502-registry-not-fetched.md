---
type: changed
issue: 1502
---
The shipped loader finds an element module by name (`pk-card` is `elements/card.js`) and no longer fetches `elements/registry.js`, so adding an element no longer makes every page heavier; drop the registry `modulepreload` hint from your pages (it still works, and `registry.js` stays for tools and error messages). The reference pages are about 530 bytes gzip and one request lighter.
