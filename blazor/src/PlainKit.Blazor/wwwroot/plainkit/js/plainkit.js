// Plainkit entry module: one import wires the page. Components are custom elements (pk-*) that load on demand, so this only starts the
// element loader and the declarative invokers; a page may also import just the modules it needs.
//
//   <script type="module">import { initPlainkit } from './plainkit/js/plainkit.js'; initPlainkit();</script>

import { initInvokers } from './invokers.js';
import { createLogger } from './log.js';
import { loadElements, observeElements } from './loader.js';

export * from './dynamic.js';
export * from './invokers.js';
export * from './log.js';
export * from './loader.js';
export * from './theme.js';
export * from './colour.js';

const log = createLogger('plainkit');

export function initPlainkit(root = document) {
    initInvokers(root);
    loadElements(root).catch(error => log.error('the element loader failed', error));
    if (root === document) observeElements(document);
}
