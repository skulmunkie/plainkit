// The Gallery's pages as page-type factories (#1239 step 3): each is (host, config, ctx) => cleanup, the contract of js/app/module.js, so a route can name one by id.
// `config` is the page's own data (an element's tag, a foundation id, the full-page sample), `ctx` is what the gallery hands over (ctx.js of the mount: the document, the
// views, the scope, the lazy sample frames, the route, the inspector hooks); a factory reads nothing else. The cleanup ends what the page started (its timers, its element
// chunks arriving late) and takes its content out of the host; mountGallery runs it before the next page is drawn and when it is destroyed.
import { applyDynamic } from '../../js/dynamic.js';
import { on, h } from './mount-support.js';
import { ELEMENTS, loadElement } from './gallery.data.js';
import { renderElement } from './elements-view.js';
import { FOUNDATIONS, blocks } from './gallery-views.js';

// The page column: a pk-container (centred, capped), the views' content in a pk-stack inside it.
const column = doc => {
    const out = h(doc, 'pk-container', { size: 'lg', padding: 'none' }), stack = h(doc, 'pk-stack');
    out.append(stack);
    return { out, stack };
};

// The note an element page shows when its data module is not there: the data of an element that lives in an optional package (dock, canvas, heat-map, markdown) ships with that package.
export const unavailableNote = (tag, err) => `${tag}: its gallery page needs the optional package that provides it (not installed here). ${err?.message ?? ''}`.trim();

// An element page's data is its own module (issue 282): a placeholder stands in until the chunk arrives, then the playground replaces it. `live` marks the page the
// inspector follows; leaving the page before the chunk lands drops the result, and the playground's timers end with the page (#1326).
function elementSlot(ctx, tag, live, hold) {
    const holder = h(ctx.doc, 'div', { 'aria-busy': 'true' });
    loadElement(tag).then(meta => {
        if (!holder.isConnected) return;
        holder.replaceWith(renderElement(meta, { doc: ctx.doc, teardown: hold, ...(live ? { onLive: element => ctx.inspect.live(meta, element), onChange: ctx.inspect.change } : {}) }));
        if (live) ctx.inspect.shown();
    }, err => { holder.removeAttribute('aria-busy'); holder.textContent = unavailableNote(tag, err); });
    return holder;
}

// One page of the column: `fill({ out, stack, put, hold }, config, ctx)` draws it. put(node) fills the stack with the view's DOM; hold(fn) registers a cleanup.
const inColumn = fill => (host, config, ctx) => {
    const { out, stack } = column(ctx.doc), stops = [];
    ctx.watchFrames();
    const put = node => { stack.replaceChildren(node); applyDynamic(out); return out; };
    fill({ out, stack, put, hold: fn => { stops.push(fn); } }, config, ctx);
    host.append(out);
    return () => { for (const stop of stops.splice(0)) stop(); ctx.releaseFrames(); out.remove(); }; // the sample scripts end while their frames are still attached
};

const elementsIndex = ctx => {
    const { el, frag, heading, grid, cardLink } = blocks(ctx.doc);
    return frag(heading('Elements', 'Custom elements with Shadow DOM: declared props, slots, events and parts. Each page below is generated from the element\'s API data, with a live playground.'),
        ctx.scope('elements').groups.map(g => el('pk-stack', { gap: 'sm' }, el('pk-heading', { level: '2', variant: 'h4' }, g.title, ' ', el('pk-text', { inline: true, tone: 'muted' }, String(g.items.length))), grid(g.items.map(i => { const e = ELEMENTS.find(x => x.tag === i.id); return cardLink(i.hash, `<${e.tag}>`, e.summary.split('. ')[0].replace(/\.$/, '') + '.'); })))));
};

const foundationsIndex = ctx => {
    const { frag, heading, grid, cardLink } = blocks(ctx.doc);
    return frag(heading('Foundations', 'The tokens every control reads.'), grid(FOUNDATIONS.filter(([id]) => ctx.scope('foundations')?.items.some(i => i.id === id)).map(([id, t, d]) => cardLink(`${ctx.B()}/foundations/${id}`, t, d))));
};

export const PAGE_TYPES = {
    // A template, pattern or layout is a whole page: the preview fills the main area.
    'gx-full': (host, fp, ctx) => {
        ctx.releaseFrames();
        const box = h(ctx.doc, 'div', { class: 'gx-stagebox' });
        const frame = h(ctx.doc, 'iframe', { class: 'gx-page-frame', title: `${fp.title} as a full page` });
        on(frame, 'load', () => ctx.applyToPage(frame, ctx.state));
        frame.src = ctx.pageUrl(fp);
        ctx.applyToPage(frame, { width: ctx.state.width });
        ctx.setStage(frame);
        box.append(frame);
        host.append(box);
        return () => box.remove();
    },
    // A bare embed filtered to some elements lists them one after another.
    'gx-collection': inColumn(({ stack, hold }, ids, ctx) => { for (const id of ids) stack.append(elementSlot(ctx, id, false, hold)); }),
    'gx-nothing': inColumn(({ put }, _, ctx) => { put(blocks(ctx.doc).nothing()); }),
    'gx-overview': inColumn(({ put }, _, ctx) => { put(ctx.views.overview()); }),
    'gx-foundations': inColumn(({ put }, { id }, ctx) => { put(id ? ctx.views.viewFoundation(id) : foundationsIndex(ctx)); }),
    'gx-elements': inColumn(({ put }, _, ctx) => { put(elementsIndex(ctx)); }),
    // an address that names no element shows the index
    'gx-element': inColumn(({ stack, put, hold }, { tag }, ctx) => { if (ELEMENTS.some(e => e.tag === tag)) stack.append(elementSlot(ctx, tag, true, hold)); else put(elementsIndex(ctx)); }),
    'gx-samples': inColumn(({ out, put }, { a, b }, ctx) => { ctx.views.samplesView(out, put, a, b); }),
    'gx-not-found': inColumn(({ put }, _, ctx) => { put(blocks(ctx.doc).notFound('Not found')); }),
};

// Which page the address shows, as [page type id, config]: `full` is the full-page sample the address names (or null), ctx.route() the section and the two segments after it.
export function pageFor(ctx, full) {
    if (full) return ['gx-full', full];
    const { section, a, b } = ctx.route();
    if (ctx.collection()) { const ids = ctx.shown(); return ids.length ? ['gx-collection', ids] : ['gx-nothing', null]; }
    // An overview the mount's scope or filter leaves empty says so instead of listing what the embedder cut.
    if (!a && ['foundations', 'elements', 'samples'].includes(section) && !ctx.scope(section)) return ['gx-nothing', null];
    if (section === 'foundations') return ['gx-foundations', { id: a }];
    if (section === 'overview') return ['gx-overview', null];
    if (section === 'elements') return ELEMENTS.some(e => e.tag === a) ? ['gx-element', { tag: a }] : ['gx-elements', null];
    if (section === 'samples') return ['gx-samples', { a, b }];
    return ['gx-not-found', null];
}
