// Plainkit entry module: one import wires every behaviour. Each initX() is independent and idempotent per root, so a page
// may also import just the modules it needs. Options are per module (see each file's header); this passes them through.
//
//   <script type="module">import { initPlainkit } from './plainkit/js/plainkit.js'; initPlainkit();</script>

import { initOverlays } from '../components/modal/modal.js';
import { initTabs } from '../components/tabs/tabs.js';
import { initSearchFields } from '../components/topbar/topbar.js';
import { initWorkspaces } from '../components/workspace/workspace.js';
import { initNav } from '../components/nav/nav.js';
import { initLocalTimes } from '../components/local-date-time/local-date-time.js';
import { syncProgress } from './dynamic.js';
import { loadElements, observeElements } from './loader.js';

export * from '../components/modal/modal.js';
export * from '../components/tabs/tabs.js';
export * from '../components/topbar/topbar.js';
export * from '../components/workspace/workspace.js';
export * from '../components/nav/nav.js';
export * from '../components/local-date-time/local-date-time.js';
export * from './dynamic.js';
export * from './loader.js';
export * from './theme.js';
export * from './colour.js';

export function initPlainkit(root = document, options = {}) {
    initOverlays(root);
    initTabs(root, options.tabs);
    initSearchFields(root, options.search);
    initWorkspaces(root);
    initNav(root);
    initLocalTimes(root);
    syncProgress(root);
    loadElements(root).catch(() => {});
    if (root === document) observeElements(document);
}
