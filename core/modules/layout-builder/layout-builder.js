// The layout builder as a module: mountLayoutBuilder(container, options) is an editor for a page built from Plainkit elements. A palette lists every element of the
// element API (grouped like the gallery, with search), the canvas shows the page live, a structure tree and the toolbar select and rearrange it, and an inspector edits
// the selected element's props from its API metadata. The page is a JSON document (js/layout-model.js) that round-trips to CSP-safe HTML; the host owns persistence.
//
//   const builder = await mountLayoutBuilder(el, { model, onchange: ({ model, reason }) => draft(model), onsave: ({ model, html }) => store(model, html) });
//   builder.getModel(); builder.toHtml(); builder.setModel(doc); builder.select('n3'); builder.undo(); builder.destroy();
//
// Options: registry (the element API: an array, or a URL of api.json; default ../elements/api.json next to the module), model (a starting document, or its JSON text;
// default an empty page), html (a starting page as markup instead: sanitised, what is refused is logged; setHtml(markup) loads one later), onchange({ model, reason }) (every edit, undo, redo and load; reason: insert, move, remove, duplicate, wrap, prop, text, slot, undo, redo, load),
// onsave({ model, html }) (adds a Save button; a returned promise is awaited, a failure is logged and shown), exporters ({ name: (model, helpers) => text }: extra export
// formats a host contributes, for example Razor from the Blazor side; used by exportAs(name)), height (any CSS length; default 40rem), theme ('dark' | 'light').
// Returns { element, getModel(), setModel(model) -> { ok, problems }, setHtml(markup) -> { ok, problems }, toHtml(options), exportAs(name), select(id), selection(), insert(tag), undo(), redo(), on(event, fn) -> off, destroy() };
// events: change ({ model, reason }), select ({ id }), problem ({ message }).
//
// Keyboard (canvas or structure tree focused): arrows select (Up and Down walk the page, Left the parent, Right the first child), Alt+arrows move the selection (Up and
// Down reorder, Left moves it out of its parent, Right into the element before it), Delete removes, Ctrl+D duplicates, Ctrl+Z undoes, Ctrl+Y or Ctrl+Shift+Z redoes.
// The toolbar and the palette do the same with buttons, so nothing needs a pointer or a drag. Pointer drag and drop is the next step and waits for a sortable element.
//
// The canvas renders the model in the page inside an inert container (a built page cannot act on the builder); selection is from element rectangles and drawn as an outline.
// Its width buttons narrow the canvas but media queries still see the real viewport: the iframe device preview is a follow-up (DESIGN.md).
// Built only from SDK components (pk-toolbar, pk-workspace, pk-tabs, pk-accordion, pk-tree, pk-button, pk-button-group, pk-input, pk-select, pk-checkbox, pk-textarea, pk-code-block,
// pk-empty-state) and the element inspector. The pure logic is js/layout-builder-logic.js and js/layout-model.js. Logging scope: layout-builder.

import * as M from '../../js/layout-model.js';
import * as L from '../../js/layout-builder-logic.js';
import { createElementInspector } from '../../js/element-inspector.js';
import { ensureStyles, styleUrls, loadJson } from '../../js/mount-support.js';
import { loadElements } from '../../js/loader.js';
import { setTheme } from '../../js/theme.js';
import { createLogger } from '../../js/log.js';
const log = createLogger('layout-builder');

const STYLES = ['../../plainkit.css'];
const OWN_STYLES = ['./layout-builder.css'];
const DEFAULT_API = '../elements/api.json';
const isText = c => typeof c === 'string';
const EDIT_EVENTS = ['input', 'change', 'pk-value-change', 'pk-change'];
const MOVES = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'out', ArrowRight: 'in' };

function h(doc, tag, props = {}, ...children) {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(props)) if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v === true ? '' : v);
    el.append(...children.filter(c => c !== null && c !== undefined && c !== false));
    return el;
}

export async function mountLayoutBuilder(container, options = {}) {
    if (!container) { log.error('mountLayoutBuilder needs a container element'); throw new TypeError('mountLayoutBuilder: container is required'); }
    const doc = container.ownerDocument;
    await ensureStyles([...styleUrls(STYLES, import.meta.url), ...styleUrls(OWN_STYLES, import.meta.url)], doc);
    const api = await loadJson(options.registry ?? new URL(DEFAULT_API, import.meta.url).href);
    if (!Array.isArray(api)) { log.error('the registry must be the element API array (dist/elements/api.json)'); throw new TypeError('mountLayoutBuilder: registry must be an array or the URL of one'); }
    const registry = M.createRegistry(api);
    if (options.blocks) log.info('reusable blocks are not part of this version of the builder yet: the option is ignored', { blocks: options.blocks.length });
    if (options.theme) setTheme(container, options.theme);

    // ---- state
    let history = M.createHistory(M.emptyDoc());
    const state = { selected: null, query: '', width: 'full', internal: false };
    const elements = new Map();
    const listeners = new Map();
    const cleanups = [];
    let destroyed = false;
    const emit = (type, detail) => { for (const fn of listeners.get(type) ?? []) { try { fn(detail); } catch (error) { log.error(`a "${type}" listener threw`, error); } } };
    const current = () => history.doc;

    // ---- interface
    const button = (action, label, extra = {}) => h(doc, 'pk-button', { 'data-action': action, size: 'mini', variant: 'ghost', ...extra }, label);
    const actions = {
        undo: button('undo', 'Undo'), redo: button('redo', 'Redo'), up: button('up', 'Up'), down: button('down', 'Down'), out: button('out', 'Out'), in: button('in', 'In'),
        duplicate: button('duplicate', 'Duplicate'), wrap: button('wrap', 'Wrap'), remove: button('remove', 'Delete', { variant: 'warn' }),
        ...(options.onsave ? { save: button('save', 'Save', { variant: 'primary' }) } : {}),
    };
    for (const b of Object.values(actions)) b.setAttribute('slot', 'actions');
    const toolbar = h(doc, 'pk-toolbar', { heading: 'Layout builder', note: '' }, ...Object.values(actions));
    const status = h(doc, 'p', { class: 'lb-status', role: 'status' });
    const hint = h(doc, 'p', { class: 'lb-hint muted' }, 'Arrows select. Alt+arrows move. Delete removes. Ctrl+Z undoes.');

    const search = h(doc, 'pk-input', { type: 'search', label: 'Find an element', placeholder: 'e.g. card, button, form', clearable: true });
    const paletteList = h(doc, 'div', { class: 'lb-palette' });
    const tree = h(doc, 'pk-tree', { label: 'Page structure' });
    const code = h(doc, 'pk-code-block', { label: 'Exported HTML', wrap: true });
    const tabs = h(doc, 'pk-tabs', { value: 'palette', label: 'Builder panels' },
        h(doc, 'pk-tab', { value: 'palette' }, 'Palette'), h(doc, 'pk-tab', { value: 'structure' }, 'Structure'), h(doc, 'pk-tab', { value: 'html' }, 'HTML'),
        h(doc, 'pk-tab-panel', { value: 'palette' }, search, paletteList),
        h(doc, 'pk-tab-panel', { value: 'structure' }, tree),
        h(doc, 'pk-tab-panel', { value: 'html' }, code));

    const empty = h(doc, 'pk-empty-state', { heading: 'An empty page', description: 'Add an element from the palette, or load a page with setModel().', tone: 'compact' });
    const page = h(doc, 'div', { class: 'lb-page' });
    page.inert = true;
    const canvas = h(doc, 'div', { class: 'lb-canvas', tabindex: '0', role: 'group', 'aria-label': 'Page preview. Select with the arrow keys or the structure tree; the page itself is not interactive here.' }, empty, page);
    const widths = h(doc, 'pk-button-group', { label: 'Canvas width', mode: 'single' },
        h(doc, 'pk-button', { 'data-width': 'phone', size: 'mini', variant: 'ghost', toggle: true, value: 'phone' }, '375px'),
        h(doc, 'pk-button', { 'data-width': 'tablet', size: 'mini', variant: 'ghost', toggle: true, value: 'tablet' }, '768px'),
        h(doc, 'pk-button', { 'data-width': 'full', size: 'mini', variant: 'ghost', toggle: true, pressed: true, value: 'full' }, 'Full'));
    const main = h(doc, 'div', { class: 'lb-main' }, widths, canvas);

    const form = h(doc, 'div', { class: 'lb-form' });
    const inspectorBox = h(doc, 'div', { class: 'lb-inspector' });
    const inspector = createElementInspector(inspectorBox, { emptyHeading: 'Nothing selected', emptyText: 'Select an element on the canvas or in the structure tree to edit it and to see its documentation and markup.' });
    const aside = h(doc, 'div', { slot: 'aside', class: 'lb-aside' }, form, inspectorBox);
    const workspace = h(doc, 'pk-workspace', { fill: true, 'aside-open': true, 'nav-label': 'Palette', 'main-label': 'Canvas', 'aside-label': 'Properties' }, h(doc, 'div', { slot: 'nav', class: 'lb-nav' }, tabs), main, aside);
    const root = h(doc, 'section', { class: 'lb', 'aria-label': 'Layout builder' }, toolbar, status, hint, workspace);
    if (options.height) root.style.height = options.height;
    container.replaceChildren(root);
    loadElements(root);

    const say = (text, kind = 'info') => { status.textContent = text; status.setAttribute('data-kind', kind); };

    // Run an edit; a refused edit is logged, shown and reported instead of throwing into the page.
    function attempt(label, fn) {
        try { return fn(); } catch (error) {
            if (!(error instanceof M.ModelError)) throw error;
            log.warn(`${label}: ${error.message}`, { code: error.code, problems: error.problems.map(p => p.message) });
            say(`${label}: ${error.message}`, 'warn');
            emit('problem', { message: error.message, code: error.code });
            return null;
        }
    }

    // ---- painting
    function renderNode(node) {
        const el = doc.createElement(node.tag);
        el.setAttribute('data-lb-id', node.id);
        for (const [k, v] of Object.entries(node.props)) {
            if (k === 'id') continue;   // the page's own ids would collide with the builder's: the canvas addresses nodes by data-lb-id
            if (k === 'hidden') { el.setAttribute('data-lb-hidden', ''); continue; }
            el.setAttribute(k, v === true ? '' : v);
        }
        const kids = Object.entries(node.slots);
        if (!kids.length && registry.entry(node.tag)?.void !== true) el.setAttribute('data-lb-empty', '');
        for (const [slot, list] of kids) for (const c of list) {
            if (isText(c)) { el.append(doc.createTextNode(c)); continue; }
            const child = renderNode(c);
            if (slot) child.setAttribute('slot', slot);
            el.append(child);
        }
        elements.set(node.id, el);
        return el;
    }

    function paintCanvas() {
        elements.clear();
        const d = current();
        page.replaceChildren(...d.nodes.map(renderNode));
        empty.hidden = d.nodes.length > 0;
        loadElements(page);
        paintSelection(false);
    }

    function paintSelection(scroll) {
        for (const el of canvas.querySelectorAll('[data-lb-selected]')) el.removeAttribute('data-lb-selected');
        if (state.selected && !M.findNode(current(), state.selected)) state.selected = null;
        const el = state.selected ? elements.get(state.selected) : null;
        if (el) { el.setAttribute('data-lb-selected', ''); if (scroll) el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }
        if (state.selected && tree.value !== state.selected) tree.value = state.selected;
        if (!state.selected && tree.value) tree.value = '';
    }

    function treeItem(node) {
        const item = h(doc, 'pk-tree-item', { label: L.nodeLabel(node), value: node.id, expanded: true });
        for (const list of Object.values(node.slots)) for (const c of list) if (!isText(c)) item.append(treeItem(c));
        return item;
    }
    function paintTree() {
        const hadFocus = tree.contains(doc.activeElement);
        tree.replaceChildren(...current().nodes.map(treeItem));
        if (state.selected) tree.value = state.selected;
        if (hadFocus) queueMicrotask(() => tree.querySelector(`pk-tree-item[value="${state.selected}"]`)?.focus());
    }

    function paintPalette() {
        const groups = L.paletteGroups(api, state.query);
        const acc = h(doc, 'pk-accordion', {});
        groups.forEach((g, i) => {
            const items = g.items.map(it => h(doc, 'pk-button', { 'data-tag': it.tag, size: 'mini', variant: 'ghost', block: true, title: it.summary, label: `Add ${it.title} (${it.tag})` }, it.title));
            acc.append(h(doc, 'pk-accordion-item', { heading: `${g.group} (${g.items.length})`, open: i === 0 || state.query !== '' }, h(doc, 'div', { class: 'lb-items' }, ...items)));
        });
        paletteList.replaceChildren(groups.length ? acc : h(doc, 'p', { class: 'muted' }, 'No element matches.'));
        loadElements(paletteList);
    }

    function paintToolbar() {
        const d = current();
        const sel = state.selected;
        const can = { undo: history.canUndo, redo: history.canRedo, duplicate: Boolean(sel), remove: Boolean(sel), wrap: Boolean(sel) };
        for (const dir of ['up', 'down', 'out', 'in']) can[dir] = Boolean(sel && L.moveTarget(d, sel, dir));
        for (const [name, b] of Object.entries(actions)) { if (name === 'save') continue; if (can[name]) b.removeAttribute('disabled'); else b.setAttribute('disabled', ''); }
        toolbar.setAttribute('note', `${M.flatten(d).length} elements${sel ? `, selected: ${L.nodeLabel(M.findNode(d, sel))}` : ''}`);
    }

    // The properties form is rebuilt when the selection or the page changed from outside it; an edit made in the form leaves it alone (so typing keeps its focus).
    function paintForm() {
        const node = state.selected ? M.findNode(current(), state.selected) : null;
        if (!node) { form.replaceChildren(); return; }
        const entry = registry.entry(node.tag);
        const at = M.locate(current(), node.id);
        const rows = [h(doc, 'h3', {}, `Properties of <${node.tag}>`)];
        // Each control sits in a pk-field, which draws the label and the help and hands them to the control.
        const field = (label, help, control) => h(doc, 'pk-field', { label, help }, control);
        if (!entry.void) rows.push(field('Text', 'The text of this element (its child elements are kept).', h(doc, 'pk-input', { 'data-role': 'text', value: (node.slots[''] ?? []).find(isText) ?? '' })));
        const parentEntry = at.parent ? registry.entry(at.parent.tag) : null;
        if (parentEntry && !parentEntry.native) {
            const names = parentEntry.slots.filter(s => !s.dynamic).map(s => s.name);
            if (!names.includes(at.slot ?? '')) names.push(at.slot ?? '');
            if (names.length > 1) rows.push(field(`Slot in <${at.parent.tag}>`, 'Which slot of the parent this element fills.', h(doc, 'pk-select', { 'data-role': 'slot', value: at.slot ?? '' }, ...names.map(n => h(doc, 'option', { value: n }, n || '(default)')))));
        }
        for (const f of L.fieldsFor(entry, node)) {
            const meta = { 'data-attr': f.attr, 'data-type': f.type };
            const help = f.description.split('. ')[0].slice(0, 110);
            if (f.type === 'enum') {
                const fallback = f.default !== undefined && f.default !== '' ? `: ${f.default}` : '';
                rows.push(field(f.attr, help, h(doc, 'pk-select', { ...meta, value: f.value ?? '' }, h(doc, 'option', { value: '' }, `(default${fallback})`), ...f.values.map(v => h(doc, 'option', { value: v }, v)))));
            } else if (f.type === 'boolean') rows.push(h(doc, 'pk-checkbox', { ...meta, label: f.attr, description: help, checked: f.value === true }, f.attr));
            else if (f.type === 'json') rows.push(field(f.attr, help, h(doc, 'pk-textarea', { ...meta, rows: 3, value: f.value ?? '' })));
            else rows.push(field(f.attr, help, h(doc, 'pk-input', { ...meta, type: f.type === 'number' ? 'number' : 'text', value: f.value ?? '' })));
        }
        form.replaceChildren(h(doc, 'pk-stack', { gap: 'sm' }, ...rows));
        loadElements(form);
    }

    function paintInspector() {
        const node = state.selected ? M.findNode(current(), state.selected) : null;
        if (!node) { inspector.show(null); return; }
        const entry = registry.entry(node.tag);
        const meta = entry.meta ?? L.nativeMeta(node.tag, entry);
        if (inspector.tag === node.tag) inspector.setElement(elements.get(node.id));
        else inspector.show({ meta, element: elements.get(node.id) });
    }

    function paintAll({ formToo = true } = {}) {
        paintCanvas(); paintTree(); paintToolbar(); paintInspector();
        if (formToo) paintForm();
        code.textContent = M.toHtml(current());
    }

    // ---- editing
    function commit(next, reason, { key = null, select, keepForm = false } = {}) {
        if (next === current()) return;
        history.push(next, key);
        if (select !== undefined) state.selected = select;
        paintAll({ formToo: !keepForm });
        emit('change', { model: next, reason });
        options.onchange?.({ model: next, reason });
    }

    function selectNode(id, { scroll = false, from = '' } = {}) {
        const next = id && M.findNode(current(), id) ? id : null;
        if (next === state.selected) return;
        state.selected = next;
        paintSelection(scroll); paintToolbar(); paintForm(); paintInspector();
        const node = next && M.findNode(current(), next);
        if (node) say(`Selected ${L.nodeLabel(node)}`);
        emit('select', { id: next });
        if (from === 'canvas') canvas.focus({ preventScroll: true });
    }

    function insert(tag) {
        const entry = registry.entry(tag);
        if (!entry) { log.warn(`insert: <${tag}> is not an element the builder knows`); say(`<${tag}> is not an element the builder knows`, 'warn'); return null; }
        const seed = L.seedSpec(tag, entry.meta);
        let last = null;
        for (const c of L.insertionCandidates(current(), state.selected, registry)) {
            let done = null;
            try { done = M.insertNode(current(), { parent: c.parent, slot: c.slot, index: c.index, node: seed }, registry); } catch (error) { if (!(error instanceof M.ModelError)) throw error; last = error; }
            if (done) { commit(done.doc, 'insert', { select: done.id }); say(`Added <${tag}> ${c.where}`); return done.id; }
        }
        log.warn(`insert: <${tag}> cannot go there: ${last?.message}`, { problems: last?.problems.map(p => p.message) });
        say(`<${tag}> cannot go there: ${last?.message ?? 'no place found'}`, 'warn');
        return null;
    }

    function move(direction) {
        const id = state.selected;
        const target = id && L.moveTarget(current(), id, direction);
        if (!target) { say(`Cannot move ${direction}`); return; }
        const r = attempt(`Cannot move ${direction}`, () => M.moveNode(current(), target, registry));
        if (r) { commit(r.doc, 'move', { select: id }); say(`Moved ${direction}`); }
    }

    function remove() {
        const id = state.selected;
        if (!id) return;
        const after = L.selectionAfterRemove(current(), id);
        const r = attempt('Cannot delete', () => M.removeNode(current(), { id }));
        if (r) { commit(r.doc, 'remove', { select: after }); say('Deleted'); }
    }
    function duplicate() {
        if (!state.selected) return;
        const r = attempt('Cannot duplicate', () => M.duplicateNode(current(), { id: state.selected }));
        if (r) { commit(r.doc, 'duplicate', { select: r.id }); say('Duplicated'); }
    }
    function wrap() {
        if (!state.selected) return;
        const r = attempt('Cannot wrap', () => M.wrapNode(current(), { id: state.selected, wrapper: 'pk-stack' }, registry));
        if (r) { commit(r.doc, 'wrap', { select: r.id }); say('Wrapped in a stack'); }
    }
    function undo() { if (history.canUndo) { history.undo(); state.selected = state.selected && M.findNode(current(), state.selected) ? state.selected : null; paintAll(); emitHistory('undo'); say('Undone'); } }
    function redo() { if (history.canRedo) { history.redo(); paintAll(); emitHistory('redo'); say('Redone'); } }
    function emitHistory(reason) { emit('change', { model: current(), reason }); options.onchange?.({ model: current(), reason }); }

    async function save() {
        try { await options.onsave({ model: current(), html: M.toHtml(current()) }); say('Saved'); }
        catch (error) { log.error('onsave failed: the page was not saved', error); say('The page was not saved. See the log for the reason.', 'warn'); }
    }

    // ---- the properties form
    function onControl(e) {
        const ctl = e.target.closest?.('[data-attr], [data-role]');
        const id = state.selected;
        if (!ctl || !id || !form.contains(ctl)) return;
        const node = M.findNode(current(), id);
        if (!node) return;
        const role = ctl.getAttribute('data-role');
        const raw = ctl.localName === 'pk-checkbox' ? ctl.checked : ctl.value;
        state.internal = true;
        try {
            if (role === 'text') {
                if (M.normalizeText(raw) === ((node.slots[''] ?? []).find(isText) ?? '')) return;
                const r = attempt('Cannot set the text', () => M.setText(current(), { id, text: raw }));
                if (r) commit(r.doc, 'text', { key: `text:${id}`, keepForm: true });
            } else if (role === 'slot') {
                if (raw === (M.locate(current(), id).slot ?? '')) return;
                const r = attempt('Cannot change the slot', () => M.setSlot(current(), { id, slot: raw }, registry));
                if (r) commit(r.doc, 'slot', { select: id });
            } else {
                const attr = ctl.getAttribute('data-attr');
                const value = L.propFromControl(ctl.getAttribute('data-type'), raw);
                if ((node.props[attr] ?? undefined) === value) return;
                const r = attempt(`Cannot set ${attr}`, () => M.setProp(current(), { id, name: attr, value }, registry));
                if (r) { ctl.removeAttribute('invalid'); ctl.removeAttribute('title'); commit(r.doc, 'prop', { key: `prop:${id}:${attr}`, keepForm: true }); }
                else { ctl.setAttribute('invalid', ''); ctl.setAttribute('title', status.textContent); }
            }
        } finally { state.internal = false; }
    }
    for (const type of EDIT_EVENTS) { form.addEventListener(type, onControl); cleanups.push(() => form.removeEventListener(type, onControl)); }

    // ---- events
    const on = (el, type, fn, opts) => { el.addEventListener(type, fn, opts); cleanups.push(() => el.removeEventListener(type, fn, opts)); };

    // The page is inert, so a click lands on the canvas: the node is the smallest element under the pointer.
    function hit(x, y) {
        let best = null, area = Infinity;
        for (const [id, el] of elements) {
            const r = el.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0 || x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
            const a = r.width * r.height;
            if (a <= area) { best = id; area = a; }
        }
        return best;
    }
    on(canvas, 'click', e => selectNode(hit(e.clientX, e.clientY), { from: 'canvas' }));
    on(toolbar, 'click', e => {
        const b = e.target.closest?.('pk-button[data-action]');
        if (!b || b.hasAttribute('disabled')) return;
        ({ undo, redo, duplicate, wrap, remove, save, up: () => move('up'), down: () => move('down'), out: () => move('out'), in: () => move('in') })[b.getAttribute('data-action')]?.();
    });
    on(paletteList, 'click', e => { const b = e.target.closest?.('pk-button[data-tag]'); if (b) insert(b.getAttribute('data-tag')); });
    on(search, 'input', () => { state.query = search.value ?? ''; paintPalette(); });
    on(search, 'pk-search', () => { state.query = search.value ?? ''; paintPalette(); });
    on(tree, 'pk-select', e => { const id = e.target.value; if (id) selectNode(id); });
    on(widths, 'click', e => {
        const b = e.target.closest?.('pk-button[data-width]');
        if (!b) return;
        state.width = b.getAttribute('data-width');
        page.setAttribute('data-width', state.width);
    });

    function isEditing(e) {
        const t = e.composedPath?.()[0] ?? e.target;
        return ['input', 'textarea', 'select'].includes(t.localName) || t.isContentEditable === true;
    }
    on(root, 'keydown', e => {
        if (isEditing(e)) return;
        const mod = e.ctrlKey || e.metaKey;
        const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
        if (mod && key === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
        if (mod && key === 'y') { e.preventDefault(); redo(); return; }
        const inCanvas = canvas.contains(e.target), inTree = tree.contains(e.target);
        if (!inCanvas && !inTree) return;
        if (e.altKey && MOVES[e.key]) { e.preventDefault(); move(MOVES[e.key]); return; }
        if (mod && key === 'd') { e.preventDefault(); duplicate(); return; }
        if (e.key === 'Delete' || e.key === 'Backspace') { if (state.selected) { e.preventDefault(); remove(); } return; }
        if (inCanvas && !e.altKey && !mod && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
            e.preventDefault();
            const next = L.nextSelection(current(), state.selected, e.key);
            if (next) selectNode(next, { scroll: true });
        } else if (inCanvas && e.key === 'Escape') selectNode(null);
    });

    // ---- the public interface
    function loadModel(input, reason, notify = true) {
        const registryDoc = M.fromJson(input, { registry });
        if (!registryDoc.doc) {
            log.error('the model could not be loaded', { problems: registryDoc.problems.slice(0, 5).map(p => `${p.code}: ${p.message}`) });
            say(`The page could not be loaded: ${registryDoc.problems[0]?.message ?? 'invalid model'}`, 'warn');
            return { ok: false, problems: registryDoc.problems };
        }
        history = M.createHistory(registryDoc.doc);
        state.selected = null;
        paintAll();
        emit('change', { model: registryDoc.doc, reason });
        if (notify) options.onchange?.({ model: registryDoc.doc, reason });
        return { ok: true, problems: registryDoc.problems };
    }

    // Markup in: sanitised by fromHtml (scripts, styles, handlers and unknown tags are refused and logged); what is kept becomes the page.
    function loadHtml(markup, notify) {
        const read = M.fromHtml(markup, { registry });
        const errors = M.errorsOf(read.problems);
        if (errors.length) log.warn(`the markup was loaded without ${errors.length} refused part(s)`, { problems: errors.slice(0, 8).map(p => `${p.code}: ${p.message}`) });
        const result = loadModel(read.doc, 'load', notify);
        if (errors.length) say(`Loaded, with ${errors.length} refused part(s): ${errors[0].message}`, 'warn');
        return { ok: result.ok, problems: read.problems };
    }

    const builder = {
        element: root,
        getModel: () => current(),
        setModel: model => loadModel(model, 'load'),
        setHtml: markup => loadHtml(markup, true),
        toHtml: opts => M.toHtml(current(), opts),
        exportAs(name) {
            if (name === 'html') return M.toHtml(current());
            const fn = options.exporters?.[name];
            if (typeof fn !== 'function') { log.warn(`exportAs: no exporter named "${name}"`, { known: Object.keys(options.exporters ?? {}) }); throw new Error(`no exporter named "${name}"`); }
            return fn(current(), { walk: M.walk, flatten: M.flatten, toHtml: M.toHtml });
        },
        select: id => selectNode(id, { scroll: true }),
        selection: () => state.selected,
        insert,
        undo, redo,
        on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type)?.delete(fn); },
        destroy() {
            if (destroyed) return;
            destroyed = true;
            for (const off of cleanups) off();
            inspector.destroy();
            listeners.clear();
            root.remove();
        },
    };

    paintPalette();
    if (options.model) loadModel(options.model, 'load', false);
    else if (typeof options.html === 'string') loadHtml(options.html, false);
    else paintAll();
    log.debug('mounted', { module: 'layout-builder', elements: api.length });
    return builder;
}
