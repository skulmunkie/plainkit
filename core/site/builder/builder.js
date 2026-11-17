// The layout builder as an app of its own (#1996): this page mounts modules/layout-builder into the whole window, with no gallery shell around it.
// The builder stores nothing itself, so the draft stays in this browser's local storage (the key the gallery module used), starting from a sample page.
import { mountLayoutBuilder } from '../../modules/layout-builder/layout-builder.js';
import { storedText, storeText } from '../../js/mount-support.js';
import { createLogger } from '../../js/log.js';

const log = createLogger('layout-builder-app');
const DRAFT = 'pk-layout-builder-draft';
const START = `<pk-stack gap="md">
  <h2>Team overview</h2>
  <pk-card heading="Open requests" tone="default">
    <p>Requests waiting for a reply.</p>
    <pk-button slot="footer" variant="primary">Review</pk-button>
  </pk-card>
  <pk-alert kind="info">Everything here is built from Plainkit elements.</pk-alert>
</pk-stack>`;

// The page's one mount, in the form of a custom mount function (what the module audit lets touch the page), run once for the page's own host element.
const app = { page: 'custom', mount: async () => {
    const host = document.getElementById('builder');
    let draft = null;
    try { draft = storedText(window, DRAFT); } catch (error) { log.debug('the draft cannot be read: starting from the sample page', error); }
    const builder = await mountLayoutBuilder(host, {
        registry: new URL('../../dist/elements/api.json', import.meta.url).href,
        ...(draft ? { model: draft } : { html: START }),
        height: '100%',
        onchange: ({ model }) => {
            const error = storeText(window, DRAFT, JSON.stringify(model));
            if (error) log.debug('the draft cannot be kept in this browser', error);
        },
    });
    if (draft && !builder.getModel().nodes.length) builder.setHtml(START);
} };
await app.mount();
