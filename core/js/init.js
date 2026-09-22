// Plainkit's minimal entry: only what initPlainkit needs (the invokers, the element loader, logging, the version), so a page that only
// calls initPlainkit() is not also made to fetch dynamic.js, theme.js and colour.js. js/plainkit.js re-exports everything here plus those
// three modules; import from here directly unless the page also uses the theming or colour helpers (see the "Wire a page" guide).
//
//   <script type="module">import { initPlainkit } from './plainkit/js/init.js'; initPlainkit();</script>

import { initInvokers } from './invokers.js';
import { createLogger } from './log.js';
import { loadElements, observeElements } from './loader.js';
import { PK_VERSION } from './version.js';

export * from './version.js';
export * from './invokers.js';
export * from './log.js';
export * from './loader.js';

const log = createLogger('plainkit');

export function initPlainkit(root = document) {
    log.debug(`Plainkit ${PK_VERSION} starting`);
    initInvokers(root);
    loadElements(root).catch(error => log.error('the element loader failed', error));
    if (root === document) observeElements(document);
}
