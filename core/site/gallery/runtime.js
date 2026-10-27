// What the Gallery's pages need from whoever shows them (the embed page and the site app's module, #1239): the content tree and what a scope or a filter leaves of it, the lazy sample frames, the
// address of a full-page sample, the stylesheets the foundations read, and the views over them. One runtime per mount; end() frees its frames.
import { TOKENS_CSS, UTILITIES_CSS, SPACING_CSS, ICONS, TEMPLATES_DIR, PREVIEW } from './paths.js';
import { restrictTree, filterTree } from '../../js/gallery-options.js';
import { LAYOUTS, PATTERNS, ELEMENTS } from './gallery.data.js';
import { makeFrame, applyToFrame, applyToPage, destroyFrame } from './frame.js';
import { applyDynamic } from '../../js/dynamic.js';
import { loadText, later, h } from './mount-support.js';
import { FOUNDATIONS, LAYOUT_ITEMS, TEMPLATE_PAGES, createViews } from './gallery-views.js';

const slug = s => s.replace(/\W+/g, '-').replace(/^-|-$/g, '').toLowerCase();

// 77 elements in one flat list is a wall on a phone: the nav folds them by the group their meta declares (the section title still opens the overview).
export function elementGroups(B) {
    const by = new Map();
    for (const m of ELEMENTS) { const g = m.group || 'Other'; if (!by.has(g)) by.set(g, []); by.get(g).push({ id: m.tag, title: m.title, hash: `${B()}/elements/${m.tag}`, aliases: m.aliases }); }
    return [...by].map(([title, items]) => ({ id: `el-${slug(title)}`, title, hash: `${B()}/elements`, items }));
}

// The content tree: section > group > item, each with the address it opens.
export function allSections(B) {
    const kind = (id, title, rows) => ({ id, title, hash: `${B()}/samples/${id}`, items: [{ id: 'overview', title: 'Overview', hash: `${B()}/samples/${id}` }, ...rows.map(([rid, t]) => ({ id: rid, title: t, hash: `${B()}/samples/${id}/${rid}` }))] });
    return [
        { id: 'foundations', title: 'Foundations', items: FOUNDATIONS.map(([id, t]) => ({ id, title: t, hash: `${B()}/foundations/${id}` })) },
        { id: 'elements', title: 'Elements', groups: elementGroups(B) },
        { id: 'samples', title: 'Samples', groups: [kind('templates', 'Templates', TEMPLATE_PAGES), kind('patterns', 'Patterns', PATTERNS.map(p => [p.id, p.title])), kind('layouts', 'Layouts', LAYOUT_ITEMS())] },
    ];
}

// The old addresses that keep working: layouts and templates now live under samples, a control page is its element's page, building blocks are gone.
// (The router follows these once and rewrites the address, so the address always names the view it shows; the app's Gallery module does the same through mapAlias.)
const element = (path, q, { name }) => (ELEMENTS.some(e => e.tag === `pk-${name}`) ? `/elements/pk-${name}` : '/elements');
export const ALIASES = {
    '/controls/:group/:name': element, '/controls/:group': '/elements', '/controls': '/elements',
    '/samples/blocks/:x': '/samples', '/samples/blocks': '/samples', '/templates/block/:x': '/samples', '/templates/block': '/samples',
    ...Object.fromEntries(['layouts', 'templates'].flatMap(k => [[`/${k}/:id`, `/samples/${k}/:id`], [`/${k}`, `/samples/${k}`]])),
};

// A mount's own runtime. B() is the address base ('#' + the host's prefix), opts the mount's options, state its { theme, width, scale }, query() the route's query, root() the scroller the lazy frames
// watch (null: the viewport), prefix the path the site app hosts the gallery under.
export function createRuntime({ doc, B, prefix = '', opts, state, query, root = () => null }) {
    const frames = new Set();
    let lazy = null, stage = null, css = null;
    const tree = () => restrictTree(allSections(B), opts);
    // What the overview pages may list: the mount's kind / group / control scope, then its filter. Unscoped and unfiltered, that is everything.
    const scope = id => filterTree(tree(), opts.filter).find(s => s.id === id);
    const scopeGroup = (sec, grp) => scope(sec)?.groups?.find(g => g.id === grp);
    const keeps = (sec, grp, id) => Boolean(scopeGroup(sec, grp)?.items.some(i => i.id === id));

    // The view is being drawn again: the sample scripts of the frames it replaces end now (a frame never scrolled into view has none).
    function releaseFrames() { for (const f of frames) destroyFrame(f); frames.clear(); stage = null; }
    function watchFrames() {
        lazy?.disconnect();
        releaseFrames();
        lazy = new doc.defaultView.IntersectionObserver(entries => { for (const e of entries) if (e.isIntersecting) { lazy.unobserve(e.target); mountFrame(e.target); } }, { root: root(), rootMargin: '400px' });
    }
    function mountFrame(slotEl) {
        if (slotEl.dataset.mounted) return;
        slotEl.dataset.mounted = '1';
        const fixed = slotEl.dataset.fixed;
        const frame = makeFrame(JSON.parse(slotEl.dataset.sample), fixed ? { ...state, width: fixed } : state, slotEl.dataset.control, doc);
        if (fixed) frame.dataset.fixed = fixed;
        frames.add(frame);
        slotEl.replaceChildren(frame);
    }
    function slot(sample, control, fixed) {
        const div = h(doc, 'div', { class: 'gx-slot' });
        div.dataset.sample = JSON.stringify(sample);
        div.dataset.control = control;
        if (fixed) div.dataset.fixed = fixed;
        div.dataset.dyn = `min-height:${sample.height ?? 60}px`;
        applyDynamic(div);
        lazy.observe(div);
        return div;
    }
    const refreshFrames = changes => {
        for (const f of frames) applyToFrame(f, f.dataset.fixed ? { ...changes, width: undefined } : changes);
        if (stage) applyToPage(stage, changes);
    };

    const navVariant = () => (query().nav === 'top' ? 'top' : 'side');
    // The address of a full-page sample: a template is its own page, a pattern or a layout is a fragment preview.html hosts. The same URL is what "Open in new page" opens.
    function pageUrl(fp, extra = {}) {
        const q = new URLSearchParams();
        let url;
        if (fp.kind === 'templates') { url = new URL(TEMPLATES_DIR + fp.file, import.meta.url); q.set('nav', navVariant()); }
        else { url = new URL(PREVIEW, import.meta.url); q.set('kind', fp.kind); q.set('id', fp.id); }
        q.set('theme', state.theme);
        for (const [k, v] of Object.entries(extra)) q.set(k, v);
        url.search = q.toString();
        return url.href;
    }
    // The foundations read the stylesheets as text; they are fetched once per mount, before the first view.
    const load = async () => { const text = p => loadText(new URL(p, import.meta.url)); css = { tokens: await text(TOKENS_CSS), utilities: await text(UTILITIES_CSS), spacing: await text(SPACING_CSS), icons: await text(ICONS) }; };
    const views = createViews({ doc, B, prefix: () => prefix, opts: () => opts, css: () => css, scope, scopeGroup, keeps, slot, state, query });
    return {
        tree, scope, views, navVariant, pageUrl, load, refreshFrames, watchFrames, releaseFrames, applyToPage,
        // What a page type of pages.js gets of the gallery (the owner adds the route, the inspector hooks and what it alone knows).
        page: () => ({ doc, B, state, views, scope, watchFrames, releaseFrames, pageUrl, applyToPage, setStage: frame => { stage = frame; } }),
        end() { lazy?.disconnect(); releaseFrames(); stage = null; },
    };
}

// A full-page sample's data from the address's section parts, or null (an unknown one is the not-found page's).
export function fullPageOf(a, b) {
    if (a === 'templates') { const tp = TEMPLATE_PAGES.find(x => x[0] === b); return tp ? { kind: 'templates', id: b, title: tp[1], file: tp[2] } : null; }
    if (a === 'patterns') { const p = PATTERNS.find(x => x.id === b); return p ? { kind: 'patterns', id: b, title: p.title } : null; }
    if (a === 'layouts') { const l = b === 'shell' ? { title: 'App shell' } : LAYOUTS.find(x => x.id === b); return l ? { kind: 'layouts', id: b, title: l.title } : null; }
    return null;
}

// The events a view's forms and pager raise, answered by going to an address (goTo(hash)): a search form (form[data-find]) goes to its address with its fields as the query a moment after the last
// keystroke and gives the search box its focus back, the pager goes to its page. on(target, type, fn) adds a listener its owner removes; the returned function cancels the pending timers.
export function viewEvents(doc, view, goTo, on) {
    const win = doc.defaultView, pending = new Set();
    const wait = (fn, ms) => { const stop = later(win, () => { pending.delete(stop); fn(); }, ms); pending.add(stop); };
    on(view, 'submit', e => e.preventDefault());
    on(view, 'pk-page', e => { const base = e.target.dataset?.base; if (base) goTo(`${base}${base.includes('?') ? '&' : '?'}p=${e.detail.page}`); });
    on(view, 'input', e => {
        const form = e.target.closest('form[data-find]'); if (!form) return;
        for (const stop of pending) stop();
        pending.clear();
        wait(() => {
            const p = new URLSearchParams([...new FormData(form)].filter(([, v]) => v && v !== 'all'));
            goTo(`${form.dataset.find}${p.toString() ? '?' + p : ''}`);
            wait(() => { const n = view.querySelector('form[data-find] pk-input[type=search]'); n?.focus(); const c = n?.shadowRoot?.querySelector('[part="control"]'); c?.setSelectionRange(c.value.length, c.value.length); }, 30);
        }, 250);
    });
    on(view, 'change', e => { const form = e.target.closest('form[data-find]'); if (form) form.dispatchEvent(new win.Event('input', { bubbles: true })); });
    return () => { for (const stop of pending) stop(); pending.clear(); };
}
