// The Gallery as the site app's module draws it (modules/gallery.js declares the nav and the search; this is the rest of the definition, #1239): routes that name the gallery's page types
// (pages.js: gx-overview, gx-foundations, gx-elements, gx-element, gx-sample, gx-not-found), each drawn in the module's one frame (a layout: the preview bar, the view and the Details drawer, built
// once by mount and moved to the page on show), the viewport, text size and drawer in the module's store (state.js). The app owns the bar, the theme, the title and the side nav.
import { registerLayout, registerPageType } from '../../js/app.js';
import { loadElements, observeElements } from '../../js/loader.js';
import { later } from './mount-support.js';
import { mapAlias } from '../../js/route-tree.js';
import { normalizeOptions } from '../../js/gallery-options.js';
import { PAGE_TYPES } from './pages.js';
import { createChrome } from './chrome.js';
import { ALIASES, createRuntime, elementGroups, fullPageOf, viewEvents } from './runtime.js';
import { GALLERY_STATE, chromeSettings } from './state.js';

// What the mounted module holds: the runtime (tree, lazy frames, views) and the frame (chrome). Made by mount, dropped by its cleanup; the layout and the page types read it.
let g = null;
const adapt = () => ({ ...g.rt.page(), inspect: g.chrome.inspect });

// The nav rows for an address: the section, the branch under it, the row itself.
const rows = ({ path }) => {
    const [sec = 'overview', a] = path.split('/').filter(Boolean);
    const branch = sec === 'elements' && a && elementGroups(() => '').find(grp => grp.items.some(i => i.id === a));
    return { ids: branch ? [sec, branch.id, `e-${a}`] : sec === 'foundations' && a ? [sec, `f-${a}`] : sec === 'samples' && a ? [sec, a] : [sec] };
};

// The view is revealed once every pk-* element in it is defined, not only imported: a late upgrade (a table, a specimen) resizes it on screen (#1212); a tag that never defines must not keep it hidden.
const reveal = host => {
    const defined = () => Promise.all([...new Set([...host.querySelectorAll(':not(:defined)')].map(e => e.localName))].filter(tag => tag.startsWith('pk-')).map(tag => customElements.whenDefined(tag)));
    let stop;
    host.hidden = true;
    loadElements(host).then(() => Promise.race([defined(), new Promise(resolve => { stop = later(host.ownerDocument.defaultView, resolve, 3000); })])).finally(() => { stop?.(); host.hidden = false; });
};

// One page type of pages.js as the framework's: an address the old gallery answered (a control page, a layout) is rewritten to the current one, the frame shows the page (a full-page sample owns it).
const page = (type, full) => (host, config, ctx) => {
    const to = full !== undefined && mapAlias(ALIASES, ctx.route.path, ctx.route.query);
    if (to) return void ctx.navigate(to, { replace: true });
    const fp = full?.(config) || null, first = !g.shown;
    g.shown = true;
    g.chrome.show(fp);
    const out = PAGE_TYPES[fp ? 'gx-full' : type](host, fp ?? config, adapt());
    if (first) reveal(host);
    return out;
};

const mount = async ctx => {
    const doc = globalThis.document, store = ctx.store, B = () => ctx.href('/');
    const css = Object.assign(doc.createElement('link'), { rel: 'stylesheet', href: new URL('./gallery.css', import.meta.url).href });
    doc.head.append(css);
    const state = { theme: ctx.theme.name, width: store.get('width'), scale: store.get('scale'), filter: '', open: new Set() };
    const rt = createRuntime({ doc, B, prefix: '/gallery', opts: normalizeOptions({}), state, query: () => ctx.route.query, root: () => g.chrome.view });
    const go = hash => ctx.navigate(hash.slice(B().length) || '/');
    const chrome = createChrome({ doc, B, hosted: true, state, on: ctx.on, pageUrl: rt.pageUrl, navVariant: rt.navVariant,
        settings: chromeSettings(store),
        act: { go, theme: ctx.theme.set, width: w => store.set('width', w), scale: v => store.set('scale', v) } });
    g = { rt, chrome, shown: false };
    // the frames follow the app's theme and the store's viewport and text size
    const stops = [ctx.theme.subscribe(name => { state.theme = name; rt.refreshFrames({ theme: name }); chrome.paint(); }),
        store.subscribe(s => { if (s.width !== state.width || s.scale !== state.scale) { Object.assign(state, { width: s.width, scale: s.scale }); rt.refreshFrames({ width: s.width, scale: s.scale }); chrome.paint(); } }),
        viewEvents(doc, chrome.view, go, ctx.on)];
    // the pages draw tables and accordions after the app scanned the page: load their elements as they are added
    const watch = observeElements(chrome.shell);
    await rt.load();
    return () => { for (const stop of stops) stop(); watch?.disconnect(); rt.end(); css.remove(); g = null; };
};

const at = (path, type, config = {}) => ({ path, page: type, config, layout: 'gallery', context: rows });
const params = ({ params: p }) => p;

// The frame fills the page's box (gallery.css); it is emptied of the last page's details before it moves, so the move does not rebuild their tables.
registerLayout('gallery', host => { host.setAttribute('data-gx-mount', ''); g.chrome.show(null); host.append(g.chrome.shell); return g.chrome.view; });
const TYPES = { 'gx-overview': page('gx-overview'), 'gx-foundations': page('gx-foundations'), 'gx-elements': page('gx-elements'), 'gx-element': page('gx-element'),
    'gx-sample': page('gx-samples', ({ a, b }) => b && fullPageOf(a, b)), 'gx-not-found': page('gx-not-found', () => null) };
for (const [id, factory] of Object.entries(TYPES)) registerPageType(id, factory);

export const hosted = {
    state: GALLERY_STATE,
    mount,
    routes: [
        at('/', 'gx-overview'), at('/foundations', 'gx-foundations'), at('/foundations/:id', 'gx-foundations', params),
        at('/elements', 'gx-elements'), at('/elements/:tag', 'gx-element', params),
        at('/samples', 'gx-sample'), at('/samples/:a', 'gx-sample', params), at('/samples/:a/:b', 'gx-sample', params),
        at('*', 'gx-not-found'),
    ],
};
