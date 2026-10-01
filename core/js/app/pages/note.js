// Built-in page type factory, loaded on demand by js/app/module.js (#346): a route pays only for the types it uses.
// 'note' (#678): <pk-note-page> (a heading and a block of prose in a card). config: { heading, body, cardHeading } - all data, no callbacks,
// no item collection: the built-in for a static informational page (About/Overview/Summary), formalizing the pk-stack > h1 + pk-card shape
// every such page used to hand-roll through page: 'custom'.
// PAGE_TYPE: read at build time by core/tools/audit/data.mjs (design section 3.2); not used at runtime.
export const PAGE_TYPE = {
    id: 'note',
    summary: 'A heading and a block of prose in a card. No data, no callbacks.',
    configKeys: ['heading', 'body', 'cardHeading'],
    states: [],
    useWhen: 'A static informational page: About, Overview, a one-off summary - no data to load, save or browse.',
};
import { mountTitled } from '../../page-shell.js';
export default (host, config = {}, ctx) => {
    const el = host.ownerDocument.createElement('pk-note-page');
    el.config = { heading: config.heading, body: config.body, cardHeading: config.cardHeading };
    return mountTitled(host, el, config.heading, { plain: true });
};
