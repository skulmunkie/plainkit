// The element inspector: shows what an element is, from its API metadata, and what it looks like right now. It draws the element's tag and
// summary, its live markup (with a copy button), then the properties, slots, events, CSS parts and properties and methods. The gallery's
// docked Details drawer uses it; a layout builder can use it for the selected element. A host adds its own sections with extraSections.
// Built only from SDK components (pk-stack, pk-accordion, pk-accordion-item, pk-code-block, pk-table, pk-empty-state); it makes no markup
// strings and loads nothing: the host has already started the elements (initPlainkit) and passes the API data.
//
//   const inspector = createElementInspector(container);
//   inspector.show({ meta, element, extraSections });   // meta: the element's API entry; element: the live element (optional)
//   inspector.refresh();                                // the live element changed: redraw the markup and the extra sections
//   inspector.setElement(el);                           // the live element was replaced by another of the same tag: follow it (markup and extra sections only)
//   inspector.show(null);                               // nothing selected: an empty state that says what the inspector shows
//   inspector.destroy();
//
// show({ meta, element, markup, extraSections }): element is the live element (its markup follows it); markup replaces the live markup with
// fixed text when there is no element. extraSections is an array of { title, render(container, { meta, element }), open? }: each becomes a
// pk-accordion-item after the built-in ones, and render fills its container with SDK components (it runs on show() and on every refresh()).
// A render that throws is logged (scope element-inspector) and its section shows a short note; the others still draw.
// Pure logic is js/element-inspector-logic.js.
//
// sectionFromData(data) turns a plain, serialisable descriptor ({ title, open?, lines?, columns?, rows?, code? }, all text: see js/gallery-sections.js)
// into such a section, drawn with the same components (p, pk-table, pk-code-block) and only ever as text: it is how a host in another frame adds one.

import { createLogger } from './log.js';
import { describeElement, cleanMarkup } from './element-inspector-logic.js';

const log = createLogger('element-inspector');

const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) { if (v === false || v === null || v === undefined) continue; el.setAttribute(k, v === true ? '' : v); }
    el.append(...kids.filter(k => k !== null && k !== undefined && k !== false));
    return el;
};
const code = text => h('code', {}, text);

function table(label, cols, rows) {
    return h('pk-table', { label }, h('table', {},
        h('thead', {}, h('tr', {}, ...cols.map(c => h('th', {}, c)))),
        h('tbody', {}, ...rows.map(r => h('tr', {}, ...r.map(c => h('td', {}, c)))))));
}

// A descriptor from another window (already through normalizeSections) as an extra section; text only, no markup is ever parsed.
export function sectionFromData(data) {
    return {
        title: data.title, open: data.open === true,
        render(box) {
            for (const line of data.lines ?? []) box.append(h('p', {}, line));
            if (data.rows?.length) box.append(table(data.title, data.columns, data.rows));
            if (data.code) { const block = h('pk-code-block', { label: data.title, wrap: true }); block.textContent = data.code; box.append(block); }
        },
    };
}

const EMPTY_TEXT = 'Open an element page to see its tag, properties, slots, events, styling hooks and its live markup with a copy button.';

export function createElementInspector(container, options = {}) {
    if (!container) { log.error('createElementInspector needs a container element'); throw new TypeError('createElementInspector: container is required'); }
    const state = { meta: null, element: null, markup: null, extra: [] };
    let markupBlock = null;
    let extraBodies = [];
    let destroyed = false;

    const currentMarkup = () => (state.element ? cleanMarkup(state.element.outerHTML) : state.markup ?? '');

    const empty = () => h('pk-empty-state', { heading: options.emptyHeading ?? 'Nothing selected', description: options.emptyText ?? EMPTY_TEXT });
    const fold = (heading, open, ...body) => h('pk-accordion-item', { heading, open }, ...body);
    const none = text => h('p', { class: 'muted' }, text);

    // Fills one extra section; a host's render that throws must not take the inspector down.
    function fill(section, body) {
        const box = h('div', {});
        try { section.render(box, { meta: state.meta, element: state.element }); body.replaceChildren(box); }
        catch (error) { log.error(`extra section "${section.title}" failed to render`, { tag: state.meta?.tag, error }); body.replaceChildren(none(`The "${section.title}" section could not be drawn.`)); }
    }

    function draw() {
        markupBlock = null; extraBodies = [];
        const d = describeElement(state.meta);
        if (!d) { container.replaceChildren(empty()); return; }
        const stack = h('pk-stack', { gap: 'sm' });
        stack.append(h('h2', {}, code(`<${d.tag}>`)), h('p', { class: 'muted' }, [d.title, d.group].filter(Boolean).join(' - ')), h('p', {}, d.summary));
        const acc = h('pk-accordion', {});
        markupBlock = h('pk-code-block', { label: 'Markup', wrap: true });
        acc.append(
            fold(state.element ? 'Live markup' : 'Markup', true, markupBlock),
            fold(`Properties (${d.props.length})`, true, d.props.length ? table('Properties', ['Name', 'Type', 'Default', 'Description'], d.props.map(p => [code(p.name), p.type, code(p.default), p.description])) : none('None.')),
            fold(`Slots (${d.slots.length})`, false, d.slots.length ? table('Slots', ['Name', 'Description'], d.slots.map(s => [code(s.name), s.description])) : none('None.')),
            fold(`Events (${d.events.length})`, false, d.events.length ? table('Events', ['Name', 'Detail', 'Description'], d.events.map(e => [code(e.name), code(e.detail), e.description])) : none('None beyond the native ones.')),
            fold(`Parts (${d.parts.length})`, false, d.parts.length ? table('Parts', ['Selector', 'Description'], d.parts.map(p => [code(p.selector), p.description])) : none('None.')),
            fold(`Custom properties (${d.cssProperties.length})`, false, d.cssProperties.length ? table('Custom properties', ['Name', 'Default', 'Description'], d.cssProperties.map(c => [code(c.name), code(c.default), c.description])) : none('None. Design tokens inherit into the element.')),
        );
        if (d.methods.length) acc.append(fold(`Methods (${d.methods.length})`, false, table('Methods', ['Name', 'Description'], d.methods.map(m => [code(m.name), m.description]))));
        if (d.writes.length) acc.append(fold(`Writes to host nodes (${d.writes.length})`, false, table('Writes to host nodes', ['Target', 'Attributes', 'Why'], d.writes.map(w => [w.target, code(w.attributes), w.why]))));
        for (const section of state.extra) {
            const body = h('div', {});
            extraBodies.push([section, body]);
            acc.append(fold(section.title, section.open === true, body));
        }
        container.replaceChildren(h('pk-stack', { gap: 'md' }, stack, acc));
        refresh();
    }

    function refresh() {
        if (destroyed) return;
        if (markupBlock) markupBlock.textContent = currentMarkup();
        for (const [section, body] of extraBodies) fill(section, body);
    }

    // Only sections that are { title, render } are kept; anything else is reported once and skipped.
    function sectionsFrom(list) {
        if (list === undefined || list === null) return [];
        if (!Array.isArray(list)) { log.warn('extraSections must be an array of { title, render }: ignored', { got: typeof list }); return []; }
        return list.filter(s => {
            const ok = s && typeof s.title === 'string' && s.title && typeof s.render === 'function';
            if (!ok) log.warn('an extra section needs a title and a render function: skipped', { section: s?.title });
            return ok;
        });
    }

    function show(next) {
        if (destroyed) return;
        if (next && !next.meta) log.warn('show() was given no meta: showing the empty state instead', { keys: Object.keys(next) });
        state.meta = next?.meta ?? null; state.element = next?.element ?? null; state.markup = next?.markup ?? null;
        state.extra = state.meta ? sectionsFrom(next.extraSections) : [];
        if (state.meta) log.debug('showing', { tag: state.meta.tag, extraSections: state.extra.length });
        draw();
    }

    // The same element type is still shown but its live element was replaced (a host that redraws its canvas): follow it and redraw the markup and extra sections only.
    function setElement(element) { if (destroyed) return; state.element = element ?? null; refresh(); }

    function destroy() { destroyed = true; container.replaceChildren(); }

    show(options.meta ? options : null);
    return { show, refresh, setElement, destroy, get tag() { return state.meta?.tag ?? null; } };
}
