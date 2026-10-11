// The Layout builder as a module of the site app (#355, step 6b): a thin host on modules/layout-builder. The builder stores nothing itself, so this keeps the draft in the
// browser's local storage (only for this demo) and starts from a sample page. Address: #/layout-builder.
import { defineModule } from '../../js/app.js';
import { mountLayoutBuilder } from '../../modules/layout-builder/layout-builder.js';
import { storedText, storeText } from '../../js/mount-support.js';

const DRAFT = 'pk-layout-builder-draft';
const START = `<pk-stack gap="md">
  <h2>Team overview</h2>
  <pk-card heading="Open requests" tone="default">
    <p>Requests waiting for a reply.</p>
    <pk-button slot="footer" variant="primary">Review</pk-button>
  </pk-card>
  <pk-alert kind="info">Everything here is built from Plainkit elements.</pk-alert>
</pk-stack>`;

// dist/ is two folders up from here (core/site/modules); 75dvh keeps the builder inside the screen under the bar
const mount = async (host, ctx) => {
    let draft = null;
    try { draft = storedText(window, DRAFT); } catch (error) { ctx.log.debug('the draft cannot be read: starting from the sample page', error); }
    const builder = await mountLayoutBuilder(host, {
        registry: new URL('../../dist/elements/api.json', import.meta.url).href,
        ...(draft ? { model: draft } : { html: START }),
        height: '75dvh',
        onchange: ({ model }) => {
            const error = storeText(window, DRAFT, JSON.stringify(model));
            if (error) ctx.log.debug('the draft cannot be kept in this browser', error);
        },
    });
    if (draft && !builder.getModel().nodes.length) builder.setHtml(START);
    return () => builder.destroy?.();
};

export default defineModule({
    id: 'layout-builder', title: 'Layout builder', icon: 'layout',
    routes: [{ path: '*', page: 'custom', config: { mount } }],
});
