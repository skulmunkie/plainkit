// The SDK gallery as a page of its own (the embed page, <pk-gallery>, the frames of the docs): ONE side nav (a pk-side-nav) whose tree is exactly the content: section > group > item. Every nav
// entry is a view with its own URL hash (#/elements/pk-button), so each view shows one topic and back/forward work. Samples render in iframes (frame.js) so the phone switch is real.
// The site app has its own Gallery module over the same parts (chrome.js, runtime.js, pages.js). Framework-free; ES module driven by gallery.data.js.
//
//   mountGallery(container, { kind, group, control, theme, width, filter, chrome, sections })   // resolves once the first view is drawn
//   setGallerySections(sections)                                                             // replace the sections a host adds to the Details drawer
//
// sections: what a host adds to the docked inspector (Details), as plain serialisable data so it also works when the gallery runs in a frame:
// [{ tag?, title, open?, lines?, columns?, rows?, code? }], all text (js/gallery-sections.js has the shape and the limits). A framed gallery
// (embed.html) takes them by message from the embedding page: <pk-gallery sections='[...]'> does that, or post
// { type: 'pk-gallery-sections', sections } to the frame after it posts { type: 'pk-gallery-ready' } to its parent.

import { readSetting, writeSetting } from './settings.js';
import { normalizeOptions, isScoped, leaves, filterLeaves, initialHash } from '../../js/gallery-options.js';
import { currentTheme, setTheme } from '../../js/theme.js';
import { initPlainkit } from '../../js/plainkit.js';
import { PAGE_TYPES, pageFor } from './pages.js';
import { normalizeSections } from '../../js/gallery-sections.js';
import { on, h, addressOf } from '../../js/mount-support.js';
import { mountRouter } from '../../js/router.js';
import { KIND_LABEL } from './gallery-views.js';
import { createChrome, setAttr } from './chrome.js';
import { ALIASES, createRuntime, fullPageOf, viewEvents } from './runtime.js';

export { pagebarTitleAttrs } from './chrome.js';

const doc = globalThis.document, win = doc?.defaultView; // undefined under node, where only the pure helpers are imported

// Everything one mounted gallery owns lives on `m`, made by mountGallery and dropped by destroy(), so nothing outlives a mount: the theme, width, scale, filter and open folds (state), the mount's
// options (opts), a bare embed (bare), the host page's title, the runtime, the frame (chrome) and the view the pages draw into, the router, the full-page sample on show and its page (leave), the host's sections.
let m = null;
const mountState = () => ({ state: { theme: 'dark', width: 'desktop', scale: 1, filter: '', open: new Set() }, opts: {}, bare: false, baseTitle: 'Plainkit Gallery', rt: null, chrome: null, view: null, router: null, full: null, leave: null, hostSections: [] });

const B = () => '#'; // the gallery's addresses: '#' + its own path
const query = () => m.router?.current()?.query ?? {}; // the address's query (#/path?q=..&nav=..), from the router

// A bare embed (no nav) with no route of its own lists the matching elements one after another.
const collection = () => m.bare && !addressOf(win).hash && (isScoped(m.opts) || Boolean(m.opts.filter)) && m.rt.tree().some(s => s.id === 'elements');

// The addresses the gallery answers, declared once (a section, then up to two more segments); the route's label is its section and :a / :b are what follows it.
// Any other address is the router's own not found (label 'Not found'), which the views draw as such.
const SECTION_ROUTES = [['overview', 0], ['foundations', 1], ['elements', 1], ['samples', 2]];
const ROUTES = [{ path: '/', label: 'overview' }, ...SECTION_ROUTES.flatMap(([label, depth]) => Array.from({ length: depth + 1 }, (_, n) => ({ path: `/${label}${[':a', ':b'].slice(0, n).map(x => `/${x}`).join('')}`, label })))];
let mounted = null; // the gallery on show: { destroy() }, so a second mount ends the first instead of stacking on it

// Every address the gallery writes goes through the router. The same address again is not a new entry.
const goTo = (hash, replace = false) => { if (addressOf(win).hash !== hash) m.router?.navigate(hash.slice(1), { replace }); };

// Where the gallery is, from the router: the section and up to two more segments of the address (#/samples/templates/page).
const route = () => { const c = m.router?.current(); return { section: c?.label ?? 'overview', a: c?.params.a, b: c?.params.b }; };

// ---- nav -----------------------------------------------------------------------------------------------------------------
// A pk-side-nav built once from the tree: a section title (a link to its overview), then its items or its folding groups (pk-nav-item
// branches with a count). The element brings the filter box, the arrow-key tree navigation and, at 1024px and below, the off-canvas drawer.
const navEl = () => m.chrome?.nav;
const navInput = () => navEl()?.shadowRoot?.querySelector('[part="filter-input"]') ?? null;

function buildNav() {
    const nav = navEl(), tree = m.rt.tree();
    const item = (it, slot) => h(doc, 'pk-nav-item', { href: it.hash, slot }, it.title);
    nav.replaceChildren(h(doc, 'a', { slot: 'brand', href: isScoped(m.opts) ? initialHash(tree) || '#/overview' : '#/overview' }, 'Gallery'), ...tree.flatMap(sec => [
        h(doc, 'a', { class: 'gx-nav-title', href: `#/${sec.id}` }, sec.title),
        ...(sec.items ? sec.items.map(i => item(i)) : sec.groups.map(g => h(doc, 'pk-nav-item', { 'data-branch': g.id }, g.title, h(doc, 'span', { slot: 'badge' }, String(g.items.length)), ...g.items.map(i => item(i, 'children'))))),
    ]));
    syncNav();
}

// The current row and the folds that show it: the branch of the route, or one the reader opened. While a filter is typed the element opens the matches itself.
function syncNav() {
    const nav = navEl(); if (!nav) return;
    const r = route();
    for (const i of nav.querySelectorAll('pk-nav-item[href]')) setAttr(i, 'current', addressOf(win).hash === i.getAttribute('href') || (Boolean(r.section) && i.getAttribute('href') === `#/${r.section}/${r.a}/${r.b}`));
    if (m.state.filter) return;
    for (const b of nav.querySelectorAll('pk-nav-item[data-branch]')) setAttr(b, 'expanded', m.state.open.has(b.dataset.branch) || Boolean(b.querySelector('pk-nav-item[current]')) || (r.section !== 'samples' && r.a === b.dataset.branch));
}

function setFilter(v) {
    m.state.filter = v;
    const input = navInput(), nav = navEl();
    if (input && input.value !== v) input.value = v;
    if (typeof nav?.filter === 'function') nav.filter(v);
    if (!v) syncNav();
}

// A template, pattern or layout is a whole page, so it is shown as one: the preview fills the gallery's main area (the page scrolls itself, no
// heading or padding around it) and the toolbar shrinks to one slim bar. Templates are their own standalone pages; patterns and layouts are
// fragments that preview.html hosts as a page. The same URL is what "Open in new page" opens.
function fullPage() {
    if (m.bare) return null;
    const { section, a, b } = route();
    return section === 'samples' && b ? fullPageOf(a, b) : null;
}

// What the page-type factories (pages.js) get of the gallery: the runtime's, the route, the collection a bare embed lists and the inspector hooks.
const pageCtx = () => ({
    ...m.rt.page(), route, collection,
    shown: () => filterLeaves(leaves(m.rt.tree()), m.opts.filter).filter(l => l.section.id === 'elements').map(l => l.id),
    inspect: m.chrome?.inspect ?? { live() {}, change() {}, shown() {} },
});

// ---- assembly ------------------------------------------------------------------------------------------------------------
function render() {
    m.leave?.(); // the page on show ends what it started before the next is drawn
    m.full = fullPage();
    m.chrome?.show(m.full);
    const ctx = pageCtx(), [type, config] = pageFor(ctx, m.full);
    m.view.replaceChildren();
    m.leave = PAGE_TYPES[type](m.view, config, ctx);
    m.view.scrollTop = 0;
    syncNav();
    if (!m.bare) {
        doc.title = `${m.full ? `${m.full.title} - ${KIND_LABEL[m.full.kind]}` : route().section} - ${m.baseTitle}`;
        setAttr(navEl(), 'open', false); // a chosen page closes the phone Contents drawer
        const btn = doc.querySelector('[data-nav-toggle]'); if (btn) setAttr(btn, 'pressed', false);
    }
}

// Replace the sections a host adds to the Details drawer (see the header); they are cleaned first, and the open drawer redraws.
export function setGallerySections(sections) {
    if (!m) return;
    m.hostSections = normalizeSections(sections);
    m.chrome?.redraw();
}

// Show the gallery in `container` (its document must load the SDK stylesheets and gallery.css). Options: kind, group, control, theme,
// width, filter, chrome ('full' keeps the nav, toolbar and inspector; 'none' shows only the content), sections (see the header). Resolves once the first view is drawn,
// with { destroy() }: the router, the document's events and the sample frames end, and the container is emptied. Mounting again destroys the gallery already on show.
export async function mountGallery(container, options = {}) {
    mounted?.destroy();
    m = mountState(); // the instance this mount owns
    m.opts = normalizeOptions(options);
    m.hostSections = normalizeSections(options.sections);
    m.baseTitle = doc.title || m.baseTitle;
    m.bare = m.opts.chrome === 'none';
    const { state } = m, stored = key => readSetting(`pk-gallery-${key}`);
    state.theme = m.opts.theme ?? currentTheme(doc.documentElement);
    state.width = m.opts.width ?? (stored('width') === 'phone' ? 'phone' : 'desktop');
    state.scale = m.bare ? 1 : Number(stored('scale')) || 1;
    state.filter = m.opts.filter ?? '';
    state.open = new Set(m.bare ? [] : JSON.parse(stored('open') ?? '[]'));
    if (m.opts.theme) setTheme(doc.documentElement, m.opts.theme);
    doc.documentElement.dataset.width = state.width;
    m.router = mountRouter(null, { routes: ROUTES, mode: 'hash', aliases: ALIASES });
    m.rt = createRuntime({ doc, B, opts: m.opts, state, query, root: () => (m.bare ? null : m.view) });
    // A scoped mount with no address of its own opens the first view of its scope (the address says so from then on).
    if (!addressOf(win).hash && isScoped(m.opts) && !collection()) goTo(initialHash(m.rt.tree()), true);
    const set = (patch, key, value) => { Object.assign(state, patch); if (key) writeSetting(`pk-gallery-${key}`, String(value)); m.rt.refreshFrames(patch); m.chrome?.paint(); };
    if (m.bare) {
        m.view = h(doc, 'div', { id: 'gx-view' });
        container.replaceChildren(h(doc, 'pk-stack', { gap: 'none', id: 'gx-shell' }, m.view));
    } else {
        m.chrome = createChrome({ doc, B, hosted: false, state, on, pageUrl: m.rt.pageUrl, navVariant: m.rt.navVariant, sections: () => m.hostSections,
            settings: { get: stored, set: (key, text) => writeSetting(`pk-gallery-${key}`, text) },
            act: { go: goTo, theme: next => { setTheme(doc.documentElement, next); writeSetting('pk-site-theme', next); set({ theme: next }); },
                width: w => { doc.documentElement.dataset.width = w; set({ width: w }, 'width', w); }, scale: v => set({ scale: v }, 'scale', v) } });
        m.view = m.chrome.view;
        container.replaceChildren(m.chrome.shell);
    }
    container.toggleAttribute('data-gx-mount', !m.bare); // the frame fills the host's box (gallery.css)
    await m.rt.load();
    if (!m.bare) buildNav();
    render();
    // The chrome and the pages are elements, loaded on demand; a host that only mounts the gallery has not called initPlainkit, so the gallery does (idempotent per root).
    // (A host that has already called it passes init: false: the behaviours must be wired once, or every click toggles twice.)
    if (options.init !== false) initPlainkit(doc);

    if (!m.bare) {
        // The nav's filter box lives in the element: a filter given by the mount waits for the element to exist.
        customElements.whenDefined('pk-side-nav').then(() => { if (m?.state.filter) setFilter(m.state.filter); });
        on(navEl(), 'input', e => { const t = e.composedPath()[0]; if (t?.matches?.('[part="filter-input"]')) { m.state.filter = t.value; if (!t.value) syncNav(); } });
        // A branch the reader opens or folds is remembered (the element also opens matches while a filter is typed: that does not emit).
        on(navEl(), 'pk-toggle', e => { const b = e.target.closest?.('pk-nav-item[data-branch]'); if (!b) return; if (b.hasAttribute('expanded')) state.open.add(b.dataset.branch); else state.open.delete(b.dataset.branch); writeSetting('pk-gallery-open', JSON.stringify([...state.open])); });
        // Escape or a tap on the backdrop closes the phone Contents drawer; the element hands focus back to its button.
        on(navEl(), 'pk-close', () => { const btn = doc.querySelector('[data-nav-toggle]'); if (btn) setAttr(btn, 'pressed', false); });
    }
    m.router.subscribe(render);
    const stopFind = viewEvents(doc, m.view, goTo, on);
    // the frames follow the page's theme, whoever changes data-theme (the switch, the host page)
    const watch = new win.MutationObserver(() => { const name = currentTheme(doc.documentElement); if (name !== state.theme) set({ theme: name }); });
    watch.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const handle = {
        destroy() {
            if (mounted !== handle) return;
            mounted = null;
            stopFind();
            watch.disconnect();
            m.router?.destroy();
            m.leave?.();
            m.rt.end();
            m = null;
            container.replaceChildren(); container.removeAttribute('data-gx-mount');
        },
    };
    mounted = handle;
    return handle;
}
