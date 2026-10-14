// The SDK gallery. ONE side nav (a pk-side-nav) whose tree is exactly the content: section > group > item. Every nav
// entry is a view with its own URL hash (#/elements/pk-button), so each view shows one topic and back/forward work. The
// app's top bar is the only other navigation. Samples render in iframes (frame.js) so the phone switch is real.
// The gallery's own chrome, views and samples are pk-* elements.
// Framework-free; ES module driven by gallery.data.js.
//
//   mountGallery(container, { kind, group, control, theme, width, filter, chrome, sections })   // resolves once the first view is drawn
//   setGallerySections(sections)                                                             // replace the sections a host adds to the Details drawer
//
// sections: what a host adds to the docked inspector (Details), as plain serialisable data so it also works when the gallery runs in a frame:
// [{ tag?, title, open?, lines?, columns?, rows?, code? }], all text (js/gallery-sections.js has the shape and the limits). A framed gallery
// (embed.html) takes them by message from the embedding page: <pk-gallery sections='[...]'> does that, or post
// { type: 'pk-gallery-sections', sections } to the frame after it posts { type: 'pk-gallery-ready' } to its parent.

import { readSetting, writeSetting } from './settings.js';
import { TOKENS_CSS, UTILITIES_CSS, SPACING_CSS, ICONS, TEMPLATES_DIR, PREVIEW } from './paths.js';
import { normalizeOptions, isScoped, restrictTree, leaves, filterLeaves, filterTree, initialHash } from '../../js/gallery-options.js';
import { LAYOUTS, PATTERNS, ELEMENTS } from './gallery.data.js';
import { makeFrame, applyToFrame, applyToPage, destroyFrame } from './frame.js';
import { currentTheme, setTheme } from '../../js/theme.js';

import { applyDynamic } from '../../js/dynamic.js';
import { initPlainkit } from '../../js/plainkit.js';
import { fillSanitizedHtml } from '../../js/sanitized-html.js';
import { PAGE_TYPES, pageFor } from './pages.js';
import { createElementInspector, sectionFromData } from '../../js/element-inspector.js';
import { normalizeSections, sectionsFor } from '../../js/gallery-sections.js';
import { mediaBelow } from '../../js/breakpoints.js';
import { clampSize, keySize, pointerSize } from '../../js/size.js';
import { on, later, loadText, h, addressOf } from '../../js/mount-support.js';
import { mountRouter } from '../../js/router.js';
import { FOUNDATIONS, LAYOUT_ITEMS, TEMPLATE_PAGES, KIND_LABEL, createViews } from './gallery-views.js';

const doc = globalThis.document, win = doc?.defaultView; // undefined under node, where only the pure helpers are imported
const $ = (s, r = doc) => r.querySelector(s);
const slug = s => s.replace(/\W+/g, '-').replace(/^-|-$/g, '').toLowerCase();

// Everything one mounted gallery owns lives on `m`, made by mountGallery and dropped by destroy(), so nothing outlives a mount: the theme, width, scale, filter and open folds (state),
// the mount's options (opts), a bare embed (bare), the path prefix the site app hosts it under (prefix: every address it writes or follows carries it), the host page's own title,
// the lazy sample frames and their observer, the stylesheets read at mount, the router, the full-page sample on show (full) and its iframe (stage), what the inspector shows,
// and what the host added to it (hostSections, see setGallerySections).
let m = null;
const mountState = () => ({ state: { theme: 'dark', width: 'desktop', scale: 1, filter: '', open: new Set() }, opts: {}, bare: false, prefix: '', baseTitle: 'Plainkit Gallery', frames: new Set(), css: null, lazy: null, router: null, full: null, stage: null, leave: null, inspecting: null, inspector: null, hostSections: [], views: null });

// the gallery's addresses: '#' + the path the host app mounts it under (empty when it is its own page) + the gallery's own path; each mount has its own prefix
const B = () => '#' + (m?.prefix ?? '');
const text = path => loadText(new URL(path, import.meta.url));

// A boolean or string prop set through its attribute, so it also lands on an element that is not upgraded yet (the elements load on demand).
const setAttr = (el, name, on) => { if (typeof on === 'boolean') el.toggleAttribute(name, on); else el.setAttribute(name, on); };

// ---- the content tree: section > group > item ---------------------------------------------------------------------------
const tree = () => restrictTree(allSections(), m.opts);
// What the overview pages may list: the mount's kind / group / control scope, then its filter. Unscoped and unfiltered, that is everything.
const scope = id => filterTree(tree(), m.opts.filter).find(s => s.id === id);
const scopeGroup = (sec, grp) => scope(sec)?.groups?.find(g => g.id === grp);
const keeps = (sec, grp, id) => Boolean(scopeGroup(sec, grp)?.items.some(i => i.id === id));

// 77 elements in one flat list is a wall on a phone: the nav folds them by the group their meta declares (the section title still opens the overview).
function elementGroups() {
    const by = new Map();
    for (const m of ELEMENTS) { const g = m.group || 'Other'; if (!by.has(g)) by.set(g, []); by.get(g).push({ id: m.tag, title: m.title, hash: `${B()}/elements/${m.tag}`, aliases: m.aliases }); }
    return [...by].map(([title, items]) => ({ id: `el-${slug(title)}`, title, hash: `${B()}/elements`, items }));
}

function allSections() {
    return [
        { id: 'foundations', title: 'Foundations', items: FOUNDATIONS.map(([id, t]) => ({ id, title: t, hash: `${B()}/foundations/${id}` })) },
        { id: 'elements', title: 'Elements', groups: elementGroups() },
        { id: 'samples', title: 'Samples', groups: [
            { id: 'templates', title: 'Templates', hash: `${B()}/samples/templates`, items: [{ id: 'overview', title: 'Overview', hash: `${B()}/samples/templates` }, ...TEMPLATE_PAGES.map(([id, title]) => ({ id, title, hash: `${B()}/samples/templates/${id}` }))] },
            { id: 'patterns', title: 'Patterns', hash: `${B()}/samples/patterns`, items: [{ id: 'overview', title: 'Overview', hash: `${B()}/samples/patterns` }, ...PATTERNS.map(p => ({ id: p.id, title: p.title, hash: `${B()}/samples/patterns/${p.id}` }))] },
            { id: 'layouts', title: 'Layouts', hash: `${B()}/samples/layouts`, items: [{ id: 'overview', title: 'Overview', hash: `${B()}/samples/layouts` }, ...LAYOUT_ITEMS().map(([id, t]) => ({ id, title: t, hash: `${B()}/samples/layouts/${id}` }))] },
        ] },
    ];
}

// A bare embed (no nav) with no route of its own lists the matching elements one after another.
const collection = () => m.bare && !addressOf(win).hash && (isScoped(m.opts) || Boolean(m.opts.filter)) && tree().some(s => s.id === 'elements');

// The old addresses that keep working: layouts and templates now live under samples, a control page is its element's page, building blocks are gone.
// (The router follows these once and rewrites the address, so the address always names the view it shows.)
const element = (path, query, { name }) => (ELEMENTS.some(m => m.tag === `pk-${name}`) ? `/elements/pk-${name}` : '/elements');
const ALIASES = {
    '/controls/:group/:name': element, '/controls/:group': '/elements', '/controls': '/elements',
    '/samples/blocks/:x': '/samples', '/samples/blocks': '/samples',
    '/layouts/:id': '/samples/layouts/:id', '/layouts': '/samples/layouts',
    '/templates/block/:x': '/samples', '/templates/block': '/samples',
    '/templates/:id': '/samples/templates/:id', '/templates': '/samples/templates',
};
// The addresses the gallery answers, declared once (a section, then up to two more segments); the route's label is its section and :a / :b are what follows it.
// Any other address is the router's own not found (label 'Not found'), which the views draw as such.
const SECTION_ROUTES = [['overview', 0], ['foundations', 1], ['elements', 1], ['samples', 2]];
const ROUTES = [{ path: '/', label: 'overview' }, ...SECTION_ROUTES.flatMap(([label, depth]) => Array.from({ length: depth + 1 }, (_, n) => ({ path: `/${label}${[':a', ':b'].slice(0, n).map(x => `/${x}`).join('')}`, label })))];
const query = () => m.router?.current()?.query ?? {}; // the address's query (#/path?q=..&nav=..), from the router
let mounted = null; // the gallery on show: { destroy() }, so a second mount ends the first instead of stacking on it

// Every address the gallery writes goes through the router (hash form '#<prefix>/path?query'; the router adds the prefix back). The same address again is not a new entry.
const goTo = (hash, replace = false) => { const to = hash.slice(B().length); if (addressOf(win).hash !== hash) m.router?.navigate(to, { replace }); };

// Where the gallery is, from the router: the section and up to two more segments of the address (#/samples/templates/page).
const route = () => { const c = m.router?.current(); return { section: c?.label ?? 'overview', a: c?.params.a, b: c?.params.b }; };

// ---- nav -----------------------------------------------------------------------------------------------------------------
// A pk-side-nav built once from the tree: a section title (a link to its overview), then its items or its folding groups (pk-nav-item
// branches with a count). The element brings the filter box, the arrow-key tree navigation and, at 1024px and below, the off-canvas drawer.
const navEl = () => $('#gx-nav');
const navInput = () => navEl()?.shadowRoot?.querySelector('[part="filter-input"]') ?? null;

const el = (tag, attrs = {}, ...kids) => h(doc, tag, attrs, ...kids);

function buildNav() {
    const nav = navEl(); if (!nav) return;
    const item = (it, slotName) => el('pk-nav-item', { href: it.hash, slot: slotName }, it.title);
    const home = isScoped(m.opts) ? initialHash(tree()) || `${B()}/overview` : `${B()}/overview`;
    nav.replaceChildren(el('a', { slot: 'brand', href: home }, 'Gallery'), ...tree().flatMap(sec => [
        el('a', { class: 'gx-nav-title', href: `${B()}/${sec.id}` }, sec.title),
        ...(sec.items ? sec.items.map(i => item(i)) : sec.groups.map(g => el('pk-nav-item', { 'data-branch': g.id }, g.title, el('span', { slot: 'badge' }, String(g.items.length)), ...g.items.map(i => item(i, 'children'))))),
    ]));
    syncNav();
}

// The current row and the folds that show it: the branch of the route, or one the reader opened. While a filter is typed the element opens the matches itself.
function syncNav() {
    const nav = navEl(); if (!nav) return;
    const r = route();
    for (const i of nav.querySelectorAll('pk-nav-item[href]')) setAttr(i, 'current', addressOf(win).hash === i.getAttribute('href') || (Boolean(r.section) && i.getAttribute('href') === `${B()}/${r.section}/${r.a}/${r.b}`));
    if (m.state.filter) return;
    for (const b of nav.querySelectorAll('pk-nav-item[data-branch]')) setAttr(b, 'expanded', m.state.open.has(b.dataset.branch) || Boolean(b.querySelector('pk-nav-item[current]')) || (r.section !== 'samples' && r.a === b.dataset.branch));
}

function setFilter(v) {
    m.state.filter = v;
    const input = navInput(); const nav = navEl();
    if (input && input.value !== v) input.value = v;
    if (typeof nav?.filter === 'function') nav.filter(v);
    if (!v) syncNav();
}

function closeContents() {
    const nav = navEl(); const btn = $('[data-gx-contents]');
    if (nav) setAttr(nav, 'open', false);
    if (btn) setAttr(btn, 'pressed', false);
}

// ---- frames (lazy) -------------------------------------------------------------------------------------------------------
// The view is being drawn again: the sample scripts of the frames it replaces end now (a frame never scrolled into view has none).
function releaseFrames() {
    for (const f of m.frames) destroyFrame(f);
    m.frames.clear();
}

function watchFrames() {
    m.lazy?.disconnect();
    releaseFrames();
    m.lazy = new IntersectionObserver(entries => { for (const e of entries) if (e.isIntersecting) { m.lazy.unobserve(e.target); mountFrame(e.target); } }, { root: m.bare ? null : $('#gx-view'), rootMargin: '400px' });
}

function mountFrame(slotEl) {
    if (slotEl.dataset.mounted) return;
    slotEl.dataset.mounted = '1';
    const sample = JSON.parse(slotEl.dataset.sample);
    const fixed = slotEl.dataset.fixed;
    const frame = makeFrame(sample, fixed ? { ...m.state, width: fixed } : m.state, slotEl.dataset.control, doc);
    if (fixed) frame.dataset.fixed = fixed;
    m.frames.add(frame);
    slotEl.replaceChildren(frame);
}

function slot(sample, control, fixed) {
    const div = h(doc, 'div', { class: 'gx-slot' });
    div.dataset.sample = JSON.stringify(sample);
    div.dataset.control = control;
    if (fixed) div.dataset.fixed = fixed;
    div.dataset.dyn = `min-height:${sample.height ?? 60}px`;
    applyDynamic(div);
    m.lazy.observe(div);
    return div;
}

// The views get what they need of the gallery through this: nothing else of its state.
const makeViews = () => createViews({ doc, B, prefix: () => m.prefix, opts: () => m.opts, css: () => m.css, scope, scopeGroup, keeps, slot, state: m.state, query });

function refreshFrames(changes) {
    for (const f of m.frames) applyToFrame(f, f.dataset.fixed ? { ...changes, width: undefined } : changes);
    if (m.stage) applyToPage(m.stage, changes);
}

// ---- full-page samples -----------------------------------------------------------------------------------------------------
// A template, pattern or layout is a whole page, so it is shown as one: the preview fills the gallery's main area (the page scrolls itself, no
// heading or padding around it) and the toolbar shrinks to one slim bar. Templates are their own standalone pages; patterns and layouts are
// fragments that preview.html hosts as a page. The same URL is what "Open in new page" opens.

function fullPage() {
    if (m.bare) return null;
    const { section, a, b } = route();
    if (section !== 'samples' || !b) return null;
    if (a === 'templates') { const tp = TEMPLATE_PAGES.find(x => x[0] === b); return tp ? { kind: 'templates', id: b, title: tp[1], file: tp[2] } : null; }
    if (a === 'patterns') { const p = PATTERNS.find(x => x.id === b); return p ? { kind: 'patterns', id: b, title: p.title } : null; }
    if (a === 'layouts') { const l = b === 'shell' ? { title: 'App shell' } : LAYOUTS.find(x => x.id === b); return l ? { kind: 'layouts', id: b, title: l.title } : null; }
    return null;
}

const navVariant = () => (query().nav === 'top' ? 'top' : 'side');

function pageUrl(fp, extra = {}) {
    const q = new URLSearchParams();
    let url;
    if (fp.kind === 'templates') { url = new URL(TEMPLATES_DIR + fp.file, import.meta.url); q.set('nav', navVariant()); }
    else { url = new URL(PREVIEW, import.meta.url); q.set('kind', fp.kind); q.set('id', fp.id); }
    q.set('theme', m.state.theme);
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
    url.search = q.toString();
    return url.href;
}

// The pagebar's title is the page's only heading in a full view (a template, pattern or layout preview has no pk-page-header): it should carry
// level-1 heading semantics only while that bar is actually showing, or a route that is not full would carry a second, invisible h1 in the DOM
// (the sweep's h1 count does not look at [hidden] or display: none). Pure, so it is tested without a doc.
export const pagebarTitleAttrs = isFull => (isFull ? { role: 'heading', 'aria-level': '1' } : {});

// The slim bar: back to the list, the title, the template nav variant, viewport, text size, theme, open in a new page.
function paintPagebar() {
    const shell = $('#gx-shell');
    if (!shell || !$('#gx-pagebar')) return;
    shell.toggleAttribute('data-full', Boolean(m.full));
    $('#gx-bar').hidden = Boolean(m.full); $('#gx-pagebar').hidden = !m.full;
    navEl().hidden = Boolean(m.prefix) || Boolean(m.full); // the site app owns the nav when it hosts the gallery
    const titleEl = $('#gx-title');
    const attrs = pagebarTitleAttrs(Boolean(m.full));
    for (const name of ['role', 'aria-level']) { if (attrs[name] !== undefined) titleEl.setAttribute(name, attrs[name]); else titleEl.removeAttribute(name); }
    if (!m.full) return;
    const label = KIND_LABEL[m.full.kind];
    $('#gx-title').textContent = m.full.title;
    const back = $('#gx-back'); back.href = `${B()}/samples/${m.full.kind}`; back.setAttribute('label', `Back to ${label}`);
    $('#gx-open').href = pageUrl(m.full, { width: m.state.width });
    for (const n of doc.querySelectorAll('#gx-pagebar [data-nav-scope]')) n.hidden = m.full.kind !== 'templates';
    for (const a of doc.querySelectorAll('#gx-pagebar [data-nav]')) { a.dataset.goto = `${B()}/samples/templates/${m.full.id}?nav=${a.dataset.nav}`; setAttr(a, a.localName === 'pk-menu-item' ? 'checked' : 'pressed', a.dataset.nav === navVariant()); }
    const th = $('#gx-theme'); th.textContent = m.state.theme === 'dark' ? 'Dark' : 'Light';
    th.setAttribute('label', `Theme: ${m.state.theme}. Switch to ${m.state.theme === 'dark' ? 'light' : 'dark'}`);
}


// What the page-type factories (pages.js) get of the gallery, and nothing else of `m`: the document, the views, the scope, the lazy frames, the route and the inspector hooks.
const pageCtx = () => ({
    doc, B, state: m.state, views: m.views, scope, route, watchFrames, releaseFrames, pageUrl, applyToPage, setStage: frame => { m.stage = frame; },
    collection, shown: () => filterLeaves(leaves(tree()), m.opts.filter).filter(l => l.section.id === 'elements').map(l => l.id),
    inspect: { live: (meta, element) => { m.inspecting = { meta, element }; }, change: () => m?.inspector?.refresh(), shown: () => renderInspector() },
});

// ---- assembly ------------------------------------------------------------------------------------------------------------
function render() {
    const body = $('#gx-view');
    m.leave?.(); // the page on show ends what it started before the next is drawn
    m.inspecting = null; m.stage = null;
    m.full = fullPage();
    const ctx = pageCtx(), [type, config] = pageFor(ctx, m.full);
    body.replaceChildren();
    m.leave = PAGE_TYPES[type](body, config, ctx);
    body.scrollTop = 0;
    syncNav();
    renderInspector();
    paintToolbar();
    if (!m.bare) {
        doc.title = `${m.full ? `${m.full.title} - ${KIND_LABEL[m.full.kind]}` : route().section} - ${m.baseTitle}`;
        closeContents();
    }
}

const phone = () => mediaBelow('phone').matches;

function renderInspector() {
    const box = $('#gx-inspector'); const toggle = $('#gx-inspect');
    if (!box) return;
    // A full-page sample owns the whole area; every other view has the Details drawer: an element page fills it, the rest show its empty state.
    toggle.hidden = Boolean(m.full);
    if (m.full) { setAttr(box, 'open', false); $('#gx-resize').hidden = true; $('#gx-view').removeAttribute('data-inspecting'); return; }
    box.setAttribute('heading', m.inspecting ? `${m.inspecting.meta.title}: details` : 'Inspector');
    m.inspector ??= createElementInspector($('#gx-inspector-body'));
    m.inspector.show(m.inspecting && { meta: m.inspecting.meta, element: m.inspecting.element, extraSections: sectionsFor(m.hostSections, m.inspecting.meta.tag).map(sectionFromData) });
    const stored = readSetting('pk-gallery-inspector');
    const open = stored === null ? Boolean(m.inspecting) && !phone() : stored === '1';
    setInspector(open, false);
}

function setInspector(open, remember = true) {
    setAttr($('#gx-inspector'), 'open', open);
    setAttr($('#gx-inspect'), 'pressed', open);
    $('#gx-resize').hidden = !open;
    $('#gx-view').toggleAttribute('data-inspecting', open);
    if (remember) writeSetting('pk-gallery-inspector', open ? '1' : '0');
}

// The inspector's own drag-resize handle: pk-splitter's pointer/keyboard/clamp engine (js/size.js, shared with pk-splitter rather than
// duplicated), but not the pk-splitter element itself. The docked drawer it resizes positions itself absolutely (via --inspector-w) and
// becomes a full-width bottom sheet on phone (drawer.css); nesting it as a splitter pane would fight that sizing on the very breakpoint
// where the handle is hidden anyway, so this stays a plain handle that reports a width in pixels (unit: 'px'), with the box's end edge
// standing in for pk-splitter's "start" via rtl: true (see #391).
function initResize() {
    const handle = $('#gx-resize'); const shell = $('#gx-shell'); const body = $('#gx-body');
    const bounds = () => ({ min: 320, max: Math.round(innerWidth * 0.7) });
    const width = () => parseInt(getComputedStyle(shell).getPropertyValue('--inspector-w'), 10) || 0;
    const apply = px => { const { min, max } = bounds(); const w = clampSize(px, min, max); shell.dataset.dyn = `--inspector-w:${w}px`; applyDynamic(shell); return w; };
    const saved = Number(readSetting('pk-gallery-inspector-w')); if (saved) apply(saved);
    on(handle, 'pointerdown', e => {
        e.preventDefault(); handle.setPointerCapture(e.pointerId);
        const move = ev => { const box = body.getBoundingClientRect(); apply(pointerSize(ev.clientX, 0, box.left, box.width, 0, true, 'px')); };
        const up = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); writeSetting('pk-gallery-inspector-w', String(width())); };
        on(handle, 'pointermove', move); on(handle, 'pointerup', up);
    });
    on(handle, 'keydown', e => {
        const { min, max } = bounds();
        const next = keySize(e.key, width(), { min, max, step: 24, horizontal: true, rtl: true });
        if (next === null) return;
        writeSetting('pk-gallery-inspector-w', String(apply(next)));
    });
}

function paintToolbar() {
    doc.querySelectorAll('[data-set-theme]').forEach(b => setAttr(b, 'pressed', b.dataset.setTheme === m.state.theme));
    doc.querySelectorAll('[data-set-width]').forEach(b => setAttr(b, 'checked', b.dataset.setWidth === m.state.width));
    doc.querySelectorAll('pk-menu-item[data-scale]').forEach(i => setAttr(i, 'checked', Number(i.dataset.scale) === m.state.scale));
    paintPagebar();
}

function setScale(v) { m.state.scale = v; writeSetting('pk-gallery-scale', String(v)); refreshFrames({ scale: v }); paintToolbar(); }

// The viewport and the text size live in one Display menu at every width, shared by the preview bar and the slim bar (no per-breakpoint variants).
const SCALES = [['0.9', '90%'], ['1', '100%'], ['1.15', '115%'], ['1.3', '130%']];
const radios = (head, attr, rows, on, scope = '') => `<pk-menu-item type="header"${scope}>${head}</pk-menu-item>${rows.map(([v, l]) => `<pk-menu-item type="radio" data-${attr}="${v}"${v === on ? ' checked' : ''}${scope}>${l}</pk-menu-item>`).join('')}`;
const displayItems = nav => `${nav ? radios('Navigation', 'nav', [['side', 'Side'], ['top', 'Top']], 'side', ' data-nav-scope hidden') : ''}${radios('Viewport', 'set-width', [['desktop', 'Desktop'], ['phone', 'Phone 375']], 'desktop')}${radios('Text size', 'scale', SCALES, '1')}`;
const displayMenu = (nav, trigger) => `<pk-dropdown placement="bottom-end">${trigger}${displayItems(nav)}</pk-dropdown>`;

// The frame: pk-app-shell (nav, header, body) in a page of its own; under the site app, which owns the nav and the header, a plain stack of the
// same parts. Either way the preview bar and the slim page bar are the header content, and the body holds the view with the docked Details drawer.
const chromeHtml = () => {
    const hosted = Boolean(m.prefix), at = name => (hosted ? '' : ` slot="${name}"`); // the stack has no slots
    const parts = `
        <pk-side-nav${at('nav')} id="gx-nav" class="gx-nav" label="Gallery contents" filterable${hosted ? ' hidden' : ''}></pk-side-nav>
        ${hosted ? '' : '<pk-button slot="header" variant="ghost" toggle data-nav-toggle>Contents</pk-button>'}
        <pk-toolbar${at('header')} id="gx-bar" role="toolbar" aria-label="Preview settings">
            ${displayMenu(false, '<pk-button slot="trigger" variant="ghost">Display</pk-button>')}
            <pk-button variant="ghost" toggle id="gx-inspect" aria-controls="gx-inspector" hidden>Details</pk-button>
        </pk-toolbar>
        <pk-toolbar${at('header')} id="gx-pagebar" role="toolbar" aria-label="Page preview" hidden>
            <pk-button variant="ghost" icon id="gx-back" href="${B()}/samples" label="Back"><pk-icon name="chevron-left"></pk-icon></pk-button>
            <strong id="gx-title"></strong>
            ${displayMenu(true, '<pk-button slot="trigger" variant="ghost">Display</pk-button>')}
            <pk-button variant="ghost" id="gx-theme" data-toggle-theme></pk-button>
            <pk-button variant="ghost" id="gx-open" href="${B()}/samples" target="_blank" rel="noopener" label="Open in a new page">Open</pk-button>
        </pk-toolbar>
        <pk-stack fill gap="none" id="gx-body">
            <div id="gx-view"></div>
            <div id="gx-resize" role="separator" aria-orientation="vertical" aria-label="Resize the inspector" tabindex="0" hidden></div>
            <pk-drawer docked id="gx-inspector" heading="Inspector" aria-label="Inspector"><div id="gx-inspector-body"></div></pk-drawer>
        </pk-stack>`;
    return hosted ? `<pk-stack fill gap="none" data-flush id="gx-shell">${parts}</pk-stack>` : `<pk-app-shell flush id="gx-shell">${parts}</pk-app-shell>`;
};

const BARE_HTML = '<pk-stack gap="none" id="gx-shell"><div id="gx-view"></div></pk-stack>';

// Replace the sections a host adds to the Details drawer (see the header); they are cleaned first, and the open drawer redraws.
export function setGallerySections(sections) {
    if (!m) return;
    m.hostSections = normalizeSections(sections);
    if (m.inspector && m.inspecting) renderInspector();
}

// Show the gallery in `container` (its document must load the SDK stylesheets and gallery.css). Options: kind, group, control, theme,
// width, filter, chrome ('full' keeps the nav, toolbar and inspector; 'none' shows only the content), sections (see the header). Resolves once the first view is drawn,
// with { destroy() }: the router, the document's events and the sample frames end, and the container is emptied. Mounting again destroys the gallery already on show.
export async function mountGallery(container, options = {}) {
    mounted?.destroy();
    m = mountState(); // the instance this mount owns
    m.views = makeViews();
    m.opts = normalizeOptions(options);
    m.hostSections = normalizeSections(options.sections);
    m.baseTitle = doc.title || m.baseTitle;
    m.bare = m.opts.chrome === 'none';
    m.prefix = options.base ?? '';
    m.state.theme = m.opts.theme ?? currentTheme(doc.documentElement);
    m.state.width = m.opts.width ?? (readSetting('pk-gallery-width') === 'phone' ? 'phone' : 'desktop');
    m.state.scale = m.bare ? 1 : Number(readSetting('pk-gallery-scale')) || 1;
    m.state.filter = m.opts.filter ?? '';
    m.state.open = new Set(m.bare ? [] : JSON.parse(readSetting('pk-gallery-open') ?? '[]'));
    if (m.opts.theme) setTheme(doc.documentElement, m.opts.theme);
    doc.documentElement.dataset.width = m.state.width;
    // A scoped mount with no address of its own opens the first view of its scope (the address says so from then on).
    const first = !addressOf(win).hash && isScoped(m.opts) && !collection() ? initialHash(tree()) : '';
    m.router = mountRouter(null, { routes: ROUTES, mode: 'hash', aliases: ALIASES, base: m.prefix });
    if (first) goTo(first, true);
    fillSanitizedHtml(container, m.bare ? BARE_HTML : chromeHtml());
    container.toggleAttribute('data-gx-mount', !m.bare); // the frame fills the host's box (gallery.css)
    m.css = { tokens: await text(TOKENS_CSS), utilities: await text(UTILITIES_CSS), spacing: await text(SPACING_CSS), icons: await text(ICONS) };
    if (!m.bare) buildNav();
    paintToolbar();
    render();
    // The chrome and the pages are elements, loaded on demand; a host that only mounts the gallery has not called initPlainkit, so the gallery does (idempotent per root).
    // (A host that has already called it, like the SDK site's own shell, passes init: false: the behaviours must be wired once, or every click toggles twice.)
    if (options.init !== false) initPlainkit(doc);

    if (!m.bare) {
        initResize();
        // The nav's filter box lives in the element: a filter given by the mount waits for the element to exist.
        customElements.whenDefined('pk-side-nav').then(() => { if (m?.state.filter) setFilter(m.state.filter); });
        on(navEl(), 'input', e => { const t = e.composedPath()[0]; if (t?.matches?.('[part="filter-input"]')) { m.state.filter = t.value; if (!t.value) syncNav(); } });
        // A branch the reader opens or folds is remembered (the element also opens matches while a filter is typed: that does not emit).
        on(navEl(), 'pk-toggle', e => { const b = e.target.closest?.('pk-nav-item[data-branch]'); if (!b) return; if (b.hasAttribute('expanded')) m.state.open.add(b.dataset.branch); else m.state.open.delete(b.dataset.branch); writeSetting('pk-gallery-open', JSON.stringify([...state.open])); });
        // Escape or a tap on the backdrop closes the phone Contents drawer; the element hands focus back to its button.
        on(navEl(), 'pk-close', () => { const btn = $('[data-nav-toggle]'); if (btn) setAttr(btn, 'pressed', false); });
        on($('#gx-inspector'), 'pk-close', () => setInspector(false));
    }
    m.router.subscribe(render);
    on($('#gx-shell'), 'click', e => {
        if (e.target.closest('#gx-inspect')) setInspector(!$('#gx-inspector').hasAttribute('open'));
        const t = e.target.closest('[data-set-theme]');
        const tt = e.target.closest('[data-toggle-theme]');
        const next = t ? t.dataset.setTheme : tt ? (m.state.theme === 'dark' ? 'light' : 'dark') : null;
        if (next) { setTheme(doc.documentElement, next); writeSetting('pk-site-theme', next); m.state.theme = next; refreshFrames({ theme: m.state.theme }); paintToolbar(); }
        const w = e.target.closest('[data-set-width]');
        if (w) { m.state.width = w.dataset.setWidth; doc.documentElement.dataset.width = m.state.width; writeSetting('pk-gallery-width', m.state.width); refreshFrames({ width: m.state.width }); paintToolbar(); }
        const go = e.target.closest('[data-goto]');
        if (go) goTo(go.dataset.goto);
        const sc = e.target.closest('pk-menu-item[data-scale]');
        if (sc) setScale(Number(sc.dataset.scale));
    });
    // What outlives the container's own elements: the document's events, the router, the lazy frames; destroy() ends them (the elements and their listeners go with the container).
    const offs = [on(doc, 'site-search', e => setFilter(e.detail)), on(doc, 'site-theme', e => { m.state.theme = e.detail; refreshFrames({ theme: m.state.theme }); paintToolbar(); })];
    const view = $('#gx-view');
    on(view, 'submit', e => { e.preventDefault(); });
    on(view, 'pk-page', e => { const base = e.target.dataset?.base; if (base) goTo(`${base}${base.includes('?') ? '&' : '?'}p=${e.detail.page}`); });
    on(view, 'input', e => {
        const form = e.target.closest('form[data-find]'); if (!form) return;
        form._cancel?.();
        form._cancel = later(window, () => { const p = new URLSearchParams([...new FormData(form)].filter(([, v]) => v && v !== 'all')); goTo(`${form.dataset.find}${p.toString() ? '?' + p : ''}`); later(window, () => { const n = $('form[data-find] pk-input[type=search]', view); n?.focus(); const c = n?.shadowRoot?.querySelector('[part="control"]'); c?.setSelectionRange(c.value.length, c.value.length); }, 30); }, 250);
    });
    on(view, 'change', e => { const form = e.target.closest('form[data-find]'); if (form) form.dispatchEvent(new Event('input', { bubbles: true })); });
    const handle = {
        destroy() {
            if (mounted !== handle) return;
            mounted = null;
            for (const off of offs) off();
            for (const form of container.querySelectorAll('form[data-find]')) form._cancel?.();
            m.router?.destroy();
            m.leave?.();
            m.lazy?.disconnect();
            releaseFrames();
            m = null;
            container.replaceChildren(); container.removeAttribute('data-gx-mount');
        },
    };
    mounted = handle;
    return handle;
}
