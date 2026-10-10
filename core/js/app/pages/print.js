// Built-in page type factory, loaded on demand by js/app/module.js (#346): a route pays only for the types it uses.
// 'print' (#1024): <pk-print-page>, a document that is the only thing that prints. config: { heading, size, margin, toolbar?, render(el, ctx) } - render fills
// the document (the element's default slot) and is business logic, never JSON data; toolbar: [{ key, label }] draws screen-only buttons, key 'back' goes back in history, any other key prints.
// PAGE_TYPE: read at build time by core/tools/audit/data.mjs (design section 3.2); not used at runtime.
export const PAGE_TYPE = {
    id: 'print',
    summary: 'A document that is the only thing that prints, with a screen-only toolbar.',
    configKeys: ['heading', 'size', 'margin', 'toolbar', 'render'],
    states: [],
    useWhen: 'A statement, a sheet of labels or a count sheet to print or save as PDF.',
};
import { mountTitled } from '../../page-shell.js';
export default (host, config = {}, ctx) => {
    const doc = host.ownerDocument, el = doc.createElement('pk-print-page');
    for (const k of ['size', 'margin']) if (config[k] !== undefined) el[k] = config[k];
    for (const t of config.toolbar ?? []) {
        const b = doc.createElement('pk-button');
        b.slot = 'toolbar';
        b.textContent = t.label;
        b.addEventListener('click', () => (t.key === 'back' ? doc.defaultView.history.back() : doc.defaultView.print()));
        el.append(b);
    }
    config.render?.(el, ctx);
    return mountTitled(host, el, config.heading, { plain: true });
};
