// The SDK theme editor page: a thin host on modules/theme-editor. The module lists every token, edits this page live, grades the text
// pairs and exports or imports the override block; this page adds the site shell, the SDK scorecard's text pairs, the storage key the
// page has always used, and the bridge that keeps the site's saved theme in step with the editor's Dark/Light switch.

import { mountShell, writeSetting } from '../shell.js';
import { mountThemeEditor } from '../../modules/theme-editor/theme-editor.js';
import { TEXT_PAIRS } from '../scorecard/scoring.data.js';

async function main() {
    mountShell({ page: 'theme', title: 'Theme editor' });
    const host = document.getElementById('te-host');
    // Cleared before the editor mounts, not after (#135): the notice and the editor's content never occupy the page in the same frame,
    // so removing it does not shift the editor content that a later removal would have already pushed onto the page.
    document.getElementById('boot-notice')?.remove();
    await mountThemeEditor(host, { pairs: TEXT_PAIRS, storageKey: 'pk-theme-overrides', readHash: true });
    new MutationObserver(() => writeSetting('pk-site-theme', document.documentElement.getAttribute('data-theme'))).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

main().catch(err => {
    const n = document.createElement('pk-alert');
    n.setAttribute('kind', 'danger');
    n.className = 'gx-notice-file';
    n.textContent = `The theme editor could not start: ${err.message}. Serve the Plainkit folder with a static server.`;
    document.body.append(n);
});
