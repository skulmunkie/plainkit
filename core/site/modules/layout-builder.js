// The Layout builder as a chrome-less module (#1996): `chrome: false` takes the bar, menu and breadcrumb off the screen while it is active, so the builder fills the viewport.
// The draft stays in this browser's local storage (only for this demo), starting from a sample page.
import { defineModule } from '../../js/app.js';
import { mountLayoutBuilder } from '../../modules/layout-builder/layout-builder.js';
import { storedText, storeText } from '../../js/mount-support.js';

const DRAFT = 'pk-layout-builder-draft';
const START = `<pk-stack gap="md">
  <h2>Team overview</h2>
  <pk-card heading="Open requests" tone="default"><p>Requests waiting for a reply.</p><pk-button slot="footer" variant="primary">Review</pk-button></pk-card>
  <pk-alert kind="info">Everything here is built from Plainkit elements.</pk-alert>
</pk-stack>`;

const mount = async (host, ctx) => {
    const doc = host.ownerDocument, area = Object.assign(doc.createElement('div'), { className: 'lb-area' });
    const css = Object.assign(doc.createElement('link'), { rel: 'stylesheet', href: new URL('./layout-builder.css', import.meta.url).href });
    doc.head.append(css);
    host.replaceChildren(Object.assign(doc.createElement('a'), { className: 'lb-back', href: '#/gallery', textContent: 'Back to the Plainkit gallery' }), area);
    let draft = null;
    try { draft = storedText(window, DRAFT); } catch (error) { ctx.log.debug('the draft cannot be read: starting from the sample page', error); }
    const builder = await mountLayoutBuilder(area, {
        registry: new URL('../../dist/elements/api.json', import.meta.url).href, height: '100%', ...(draft ? { model: draft } : { html: START }),
        onchange: ({ model }) => { const error = storeText(window, DRAFT, JSON.stringify(model)); if (error) ctx.log.debug('the draft cannot be kept in this browser', error); },
    });
    if (draft && !builder.getModel().nodes.length) builder.setHtml(START);
    return () => { builder.destroy?.(); css.remove(); };
};

export default defineModule({
    id: 'layout-builder', title: 'Layout builder', icon: 'layout', chrome: false, footer: false,
    routes: [{ path: '*', page: 'custom', config: { mount } }],
});
