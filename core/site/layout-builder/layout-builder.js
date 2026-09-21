// The SDK layout builder page: a thin host on modules/layout-builder. The module is the editor; this page adds the site shell, a starting page and a place to keep
// the draft (the builder stores nothing itself, so the host does: here, the browser's local storage, only for this demo page).

import { mountShell } from '../shell.js';
import { mountLayoutBuilder } from '../../modules/layout-builder/layout-builder.js';
import { createLogger } from '../../js/log.js';
const log = createLogger('layout-builder-page');

const DRAFT = 'pk-layout-builder-draft';
const START = `<pk-stack gap="md">
  <h2>Team overview</h2>
  <pk-card heading="Open requests" tone="default">
    <p>Requests waiting for a reply.</p>
    <pk-button slot="footer" variant="primary">Review</pk-button>
  </pk-card>
  <pk-alert kind="info">Everything here is built from Plainkit elements.</pk-alert>
</pk-stack>`;

function stored() {
    try { return localStorage.getItem(DRAFT); } catch (error) { log.debug('the draft cannot be read: starting from the sample page', error); return null; }
}

async function main() {
    mountShell({ page: 'layout-builder', title: 'Layout builder' });
    const host = document.getElementById('lb-host');
    const draft = stored();
    const builder = await mountLayoutBuilder(host, {
        registry: '../../dist/elements/api.json',
        ...(draft ? { model: draft } : { html: START }),
        height: 'calc(100vh - 10rem)',
        onchange: ({ model }) => {
            try { localStorage.setItem(DRAFT, JSON.stringify(model)); } catch (error) { log.debug('the draft cannot be kept in this browser', error); }
        },
    });
    if (draft && !builder.getModel().nodes.length) builder.setHtml(START);
    document.getElementById('boot-notice')?.remove();
}

main().catch(err => {
    const n = document.createElement('pk-alert');
    n.setAttribute('kind', 'danger');
    n.className = 'gx-notice-file';
    n.textContent = `The layout builder could not start: ${err.message}. Serve the Plainkit folder with a static server.`;
    document.body.append(n);
});
