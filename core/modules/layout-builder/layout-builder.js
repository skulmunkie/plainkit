// The layout builder as a module: mountLayoutBuilder(container, options) is an editor for a page built from Plainkit elements. A palette lists every element of the
// element API (grouped like the gallery, with search), the canvas shows the page live, a structure tree and the Edit menu select and rearrange it, and an inspector edits
// the selected element's props from its API metadata. The page is a JSON document (js/layout-model.js) that round-trips to CSP-safe HTML; the host owns persistence.
//
//   const builder = await mountLayoutBuilder(el, { model, onchange: ({ model, reason }) => draft(model), onsave: ({ model, html }) => store(model, html) });
//   builder.getModel(); builder.toHtml(); builder.setModel(doc); builder.select('n3'); builder.undo(); builder.destroy();
//
// Options: registry (the element API: an array, or a URL of api.json; default ../elements/api.json next to the module), model (a starting document, or its JSON text;
// default an empty page), html (a starting page as markup instead: sanitised, what is refused is logged; setHtml(markup) loads one later), onchange({ model, reason }) (every edit, undo, redo and load; reason: insert, move, remove, duplicate, wrap, prop, text, slot, undo, redo, load),
// onsave({ model, html }) (adds a File menu with Save; a returned promise is awaited, a failure is logged and shown), exporters ({ name: (model, helpers) => text }: extra export
// formats a host contributes, for example Razor from the Blazor side; used by exportAs(name)), height (any CSS length; default 40rem), theme ('dark' | 'light').
// Returns { element, getModel(), setModel(model) -> { ok, problems }, setHtml(markup) -> { ok, problems }, toHtml(options), exportAs(name), select(id), selection(), insert(tag), undo(), redo(), on(event, fn) -> off, destroy() };
// events: change ({ model, reason }), select ({ id }), problem ({ message }).
//
// Keyboard (canvas or structure tree focused): arrows select (Up and Down walk the page, Left the parent, Right the first child), Alt+arrows move the selection (Up and
// Down reorder, Left moves it out of its parent, Right into the element before it), Delete removes, Ctrl+D duplicates, Ctrl+Z undoes, Ctrl+Y or Ctrl+Shift+Z redoes,
// Ctrl+S saves. The toolbar's File and Edit menus (and the canvas's right-click menu) run the same functions and show these keys: neither is replaced by drag-and-drop (issue #174).
//
// Pointer/touch drag-and-drop (issue #174, built on pk-sortable, core/elements/sortable/): the top-level page order is a real pk-sortable of pk-sortable-item rows,
// each with its own 44px drag handle; dragging one reorders the page for real (a pk-reorder event drives M.moveNode, same as Alt+arrows). A palette button is a second
// drag source, using pk-sortable's external-drop API (beginExternalDrag/externalDragOver/endExternalDrag): dropped between top-level rows it inserts there; dropped on
// a container (hit-tested, not nested pk-sortable: wrapping arbitrary slotted content would break the many elements whose shadow CSS keys off ::slotted() directly, for
// example pk-stack's dividers or pk-card's [slot="media"]) it inserts inside that container's default slot, which is the "slot-aware" half of the drop. Reordering
// *inside* a container, and moving a node into or out of one, stay keyboard/menu-only in this iteration (Alt+Left/Right, Alt+Up/Down, Move out/in): a real, but scoped,
// limitation flagged on #174 rather than pretending a further recursive pk-sortable nesting was built and verified.
//
// Each canvas element also gets an Edit/Delete icon chip (issue #174) that follows whichever node is hovered or, since touch has no hover, selected -- a tap already
// selects (the canvas is inert), so touch reaches the chip through selection alone, with no separate gesture needed. Edit focuses the properties form for that node;
// Delete removes it. Up/Down/Out/In/Duplicate/Wrap are Edit menu items, canvas context-menu items and keyboard shortcuts rather than more icons (a decision recorded on #174).
//
// The chrome is a pk-dock (issue #432): Palette, Structure and HTML are tabs of its left group, the canvas the center, Properties the right; any of them can be
// resized, moved or closed and reopened from the dock's own Panels menu. Its toolbar-start slot holds the File (Save, only with onsave) and Edit menus. Below the
// phone breakpoint the dock draws every panel as one tab strip and the menus stay in its toolbar, so Save and every edit stay reachable by touch.
// Right click (or Shift+F10, or a touch long press, all pk-context-menu) on the canvas opens the element menu for the element under the pointer; on a palette
// button it offers Add.
//
// The canvas is a pk-design-surface rendering the model inside its inert page (a built page cannot act on the builder); selection is from element rectangles and drawn as a mark.
// Its width buttons narrow the canvas but media queries still see the real viewport: the iframe device preview is a follow-up (DESIGN.md).
// Built only from SDK components (pk-dock, pk-dropdown, pk-menu-item, pk-context-menu, pk-accordion, pk-tree, pk-button, pk-button-group, pk-input, pk-select, pk-checkbox, pk-textarea, pk-code-block,
// pk-empty-state, pk-design-surface, pk-sortable, pk-sortable-item, pk-icon) and the element inspector. The pure logic is js/layout-builder-logic.js and js/layout-model.js. Logging scope: layout-builder.

import * as M from '../../js/layout-model.js';
import * as L from '../../js/layout-builder-logic.js';
import { createElementInspector } from '../../js/element-inspector.js';
import { ensureStyles, styleUrls, loadJson, runtimeUrl, h, on as listen } from '../../js/mount-support.js';
import { loadElements } from '../../js/loader.js';
import { setTheme } from '../../js/theme.js';
import { applyDynamic } from '../../js/dynamic.js';
import { createLogger } from '../../js/log.js';
import { MOVE_KEYS } from '../../js/tree-reorder.js';
const log = createLogger('layout-builder');

const STYLES = ['../../plainkit.css'];
const OWN_STYLES = ['./layout-builder.css'];
const DEFAULT_API = '../../dist/elements/api.json';
const isText = c => typeof c === 'string';
const EDIT_EVENTS = ['input', 'change', 'pk-value-change', 'pk-change'];

export async function mountLayoutBuilder(container, options = {}) {
    if (!container) { log.error('mountLayoutBuilder needs a container element'); throw new TypeError('mountLayoutBuilder: container is required'); }
    const doc = container.ownerDocument;
    await ensureStyles([...styleUrls(STYLES, import.meta.url), ...styleUrls(OWN_STYLES, import.meta.url)], doc);
    const api = await loadJson(options.registry ?? runtimeUrl(DEFAULT_API, import.meta.url));
    if (!Array.isArray(api)) { log.error('the registry must be the element API array (dist/elements/api.json)'); throw new TypeError('mountLayoutBuilder: registry must be an array or the URL of one'); }
    const registry = M.createRegistry(api);
    if (options.blocks) log.info('reusable blocks are not part of this version of the builder yet: the option is ignored', { blocks: options.blocks.length });
    if (options.theme) setTheme(container, options.theme);

    // ---- state
    let history = M.createHistory(M.emptyDoc());
    const state = { selected: null, hover: null, dropTarget: null, chip: null, query: '', internal: false };
    const elements = new Map();
    const listeners = new Map();
    const cleanups = [];
    let destroyed = false;
    const emit = (type, detail) => { for (const fn of listeners.get(type) ?? []) { try { fn(detail); } catch (error) { log.error(`a "${type}" listener threw`, error); } } };
    const current = () => history.doc;

    // ---- interface
    // Menus (issue #432): the dock's toolbar-start slot holds File (Save, only with onsave) and Edit; the canvas has the Edit menu's element actions as
    // its context menu. Every item's value is an action name that run() maps to the same function the keyboard handler calls. The dock's own Panels
    // menu already reopens a closed panel, so there is no View menu.
    const KEYS = { undo: 'Ctrl+Z', redo: 'Ctrl+Y', save: 'Ctrl+S', duplicate: 'Ctrl+D', remove: 'Delete', up: 'Alt+Up', down: 'Alt+Down', out: 'Alt+Left', in: 'Alt+Right' };
    const item = (action, label, extra = {}) => h(doc, 'pk-menu-item', { value: action, 'data-action': action, ...extra }, label, KEYS[action] && h(doc, 'span', { slot: 'suffix' }, KEYS[action]));
    const divider = () => h(doc, 'pk-menu-item', { type: 'divider' });
    const nodeItems = () => [item('duplicate', 'Duplicate'), item('wrap', 'Wrap in a stack'), item('remove', 'Delete', { danger: true }), divider(),
        item('up', 'Move up'), item('down', 'Move down'), item('out', 'Move out'), item('in', 'Move in')];
    const menu = (name, ...items) => h(doc, 'pk-dropdown', { slot: 'toolbar-start', 'data-menu': name.toLowerCase() }, h(doc, 'pk-button', { slot: 'trigger', variant: 'ghost', size: 'mini' }, name), ...items);
    const menus = [...(options.onsave ? [menu('File', item('save', 'Save'))] : []), menu('Edit', item('undo', 'Undo'), item('redo', 'Redo'), divider(), ...nodeItems())];
    const status = h(doc, 'p', { class: 'lb-status', role: 'status' });
    const hint = h(doc, 'p', { class: 'lb-hint muted' }, 'Arrows select. Alt+arrows move. Delete removes. Ctrl+Z undoes. Right-click an element for its menu.');

    const search = h(doc, 'pk-input', { type: 'search', label: 'Find an element', placeholder: 'e.g. card, button, form', clearable: true });
    const paletteList = h(doc, 'div', { class: 'lb-palette' });
    const tree = h(doc, 'pk-tree', { label: 'Page structure' });
    const code = h(doc, 'pk-code-block', { label: 'Exported HTML', wrap: true });
    // A palette button's context menu: Add, the same insert() a click runs. Its target is remembered when the menu opens (pointer or Shift+F10).
    const paletteMenu = h(doc, 'pk-context-menu', { class: 'lb-palette-menu' }, paletteList, h(doc, 'pk-menu-item', { slot: 'menu', value: 'add' }, 'Add to the page'));

    const empty = h(doc, 'pk-empty-state', { heading: 'An empty page', description: 'Add an element from the palette, or load a page with setModel().', tone: 'compact' });
    // The canvas is a pk-design-surface: it frames the page (inert, width frames), draws the selection, drop-target, hidden and empty marks from the node
    // rectangles and places the Edit/Delete chip (slot chip) beside the hovered node or, since touch has no hover, the selected one. Up/Down/Out/In/Duplicate/Wrap
    // stay Edit menu items, context-menu items and keyboard shortcuts rather than more icons (a decision recorded on #174).
    const canvas = h(doc, 'pk-design-surface', { label: 'Page preview. Select with the arrow keys or the structure tree; the page itself is not interactive here.' }, empty,
        h(doc, 'pk-button', { slot: 'chip', size: 'mini', variant: 'ghost', icon: true, 'icon-name': 'edit', 'data-node-action': 'edit', label: 'Edit' }, 'Edit'),
        h(doc, 'pk-button', { slot: 'chip', size: 'mini', variant: 'warn', icon: true, 'icon-name': 'trash', 'data-node-action': 'trash', label: 'Delete' }, 'Delete'));
    const widths = h(doc, 'pk-button-group', { label: 'Canvas width', mode: 'single' },
        h(doc, 'pk-button', { 'data-width': 'phone', size: 'mini', variant: 'ghost', toggle: true, value: 'phone' }, '375px'),
        h(doc, 'pk-button', { 'data-width': 'tablet', size: 'mini', variant: 'ghost', toggle: true, value: 'tablet' }, '768px'),
        h(doc, 'pk-button', { 'data-width': 'full', size: 'mini', variant: 'ghost', toggle: true, pressed: true, value: 'full' }, 'Full'));
    // The canvas's context menu wraps it from outside: the surface has contain: paint, which would clip a fixed-position menu placed inside it.
    const canvasMenu = h(doc, 'pk-context-menu', { class: 'lb-canvas-menu' }, canvas, ...nodeItems().map(i => { i.setAttribute('slot', 'menu'); return i; }));
    const actionItems = () => root.querySelectorAll('pk-menu-item[data-action]');

    const form = h(doc, 'div', { class: 'lb-form' });
    const inspectorBox = h(doc, 'div', { class: 'lb-inspector' });
    const inspector = createElementInspector(inspectorBox, { emptyHeading: 'Nothing selected', emptyText: 'Select an element on the canvas or in the structure tree to edit it and to see its documentation and markup.' });
    // Five pk-dock panels: Palette, Structure and HTML share the left group (the dock draws them as tabs), the canvas is the center, Properties the right.
    const panel = (id, heading, group, ...kids) => h(doc, 'div', { slot: id, 'data-heading': heading, 'data-group': group, class: 'lb-panel' }, ...kids);
    const props = panel('properties', 'Properties', 'right', form, inspectorBox);
    const dock = h(doc, 'pk-dock', { label: 'Layout builder panels' }, ...menus,
        panel('palette', 'Palette', 'left', search, paletteMenu), panel('structure', 'Structure', 'left', tree), panel('html', 'HTML', 'left', code),
        panel('canvas', 'Canvas', 'center', widths, canvasMenu), props);
    const root = h(doc, 'section', { class: 'lb', 'aria-label': 'Layout builder' }, status, hint, dock);
    if (options.height) { root.dataset.dyn = `height:${options.height}`; applyDynamic(root); }
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
            if (k === 'hidden') { el.setAttribute('data-surface-hidden', ''); continue; }
            el.setAttribute(k, v === true ? '' : v);
        }
        const kids = Object.entries(node.slots);
        if (!kids.length && registry.entry(node.tag)?.void !== true) el.setAttribute('data-surface-empty', '');
        for (const [slot, list] of kids) for (const c of list) {
            if (isText(c)) { el.append(doc.createTextNode(c)); continue; }
            const child = renderNode(c);
            if (slot) child.setAttribute('slot', slot);
            el.append(child);
        }
        elements.set(node.id, el);
        return el;
    }

    // The top-level page order is wired to pk-sortable (its own children are plain divs, not a custom element's shadow slot, so wrapping
    // them costs nothing: unlike a slot inside a pk-* element, nothing here relies on ::slotted() seeing the wrapped tag directly). A node
    // nested inside a container (a card's default slot, say) is rendered exactly as before, unwrapped: pk-sortable-item's own content part
    // would sit between a container and its ::slotted() rules and break the 34-odd element stylesheets that key off the slotted tag or
    // attribute directly (pk-stack's dividers, pk-card's [slot="media"], and so on). So canvas drag reorders the top level for real; moving
    // a node into or out of a container, or reordering inside one, stays the keyboard fallback (Alt+Left/Right, Alt+Up/Down) and the
    // Edit menu's Move items. A palette element dragged onto a container (not between top-level rows) still inserts inside it
    // (see startExternalDrag/updateExternalHover): that is the "slot-aware" half of the drop, done by hit-testing rather than nesting
    // pk-sortable, so it does not pay the same ::slotted cost.
    function paintCanvas() {
        elements.clear();
        const d = current();
        const sortable = doc.createElement('pk-sortable');
        sortable.className = 'lb-canvas-sortable';
        sortable.toggleAttribute('accept-external', true);
        sortable.setAttribute('label', 'Page');
        for (const node of d.nodes) {
            const item = doc.createElement('pk-sortable-item');
            item.value = node.id;
            item.append(renderNode(node));
            sortable.append(item);
        }
        canvasSortable()?.remove();
        canvas.append(sortable);
        empty.hidden = d.nodes.length > 0;
        loadElements(canvas);
        paintSelection(false);
    }
    const canvasSortable = () => canvas.querySelector(':scope > .lb-canvas-sortable');

    function paintSelection(scroll) {
        if (state.selected && !M.findNode(current(), state.selected)) state.selected = null;
        const el = state.selected ? elements.get(state.selected) : null;
        canvas.selected = el ?? null;
        if (el && scroll) canvas.reveal(el);
        if (state.selected && tree.value !== state.selected) tree.value = state.selected;
        if (!state.selected && tree.value) tree.value = '';
        updateControls();
    }

    // The chip follows the hovered node, falling back to the selected one (the only thing touch can reach): whichever id `pointerTarget()` resolves to.
    function pointerTarget() { return state.hover ?? state.selected; }
    function updateControls() {
        state.chip = pointerTarget();
        canvas.chipFor = (state.chip && elements.get(state.chip)) || null;
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
        for (const i of actionItems()) i.toggleAttribute('disabled', i.dataset.action !== 'save' && !can[i.dataset.action]);
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
        if (from === 'canvas') canvas.part('frame').focus({ preventScroll: true });
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

    // ---- events
    const on = (el, type, fn, opts) => { cleanups.push(listen(el, type, fn, opts)); };

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
    for (const type of EDIT_EVENTS) on(form, type, onControl);

    // The page is inert, so a click lands on the canvas: the node is the deepest element under the pointer (the surface's nodeAt).
    const hit = (x, y) => canvas.nodeAt(x, y)?.closest('[data-lb-id]')?.getAttribute('data-lb-id') ?? null;
    on(canvas, 'click', e => { if (!e.target.closest?.('[slot=chip]')) selectNode(hit(e.clientX, e.clientY), { from: 'canvas' }); });
    // Hover tracking for the chip: moving over the chip itself (not over the underlying element) leaves the target alone, so the buttons don't vanish on the way to them.
    on(canvas, 'pointermove', e => {
        if (e.target.closest?.('[slot=chip]') || canvas.dragging) return;
        const id = hit(e.clientX, e.clientY);
        if (id !== state.hover) { state.hover = id; updateControls(); }
    });
    on(canvas, 'pointerleave', () => { if (state.hover) { state.hover = null; updateControls(); } });
    on(canvas, 'click', e => {
        const b = e.target.closest?.('pk-button[data-node-action]');
        const id = state.chip;
        if (!b || !id) return;
        const action = b.getAttribute('data-node-action');
        if (action === 'edit') { selectNode(id, { scroll: true }); queueMicrotask(() => props.querySelector('input, select, textarea, pk-input, pk-select, pk-switch, pk-textarea')?.focus()); }
        else if (action === 'trash') { selectNode(id); remove(); }
    });
    // A menu choice runs the same function as its keyboard shortcut (the keydown handler below).
    const run = action => ({ undo, redo, duplicate, wrap, remove, save, up: () => move('up'), down: () => move('down'), out: () => move('out'), in: () => move('in') })[action]?.();
    for (const m of [...menus, canvasMenu]) on(m, 'pk-select', e => { if (e.target.localName === 'pk-menu-item' && !e.target.disabled) run(e.target.dataset.action); });
    // A right click on the canvas selects the element under the pointer first, so its menu acts on that element (Shift+F10 acts on the selection).
    on(canvas, 'contextmenu', e => selectNode(hit(e.clientX, e.clientY)));
    let paletteTag = null;
    on(paletteMenu, 'pk-open', e => { paletteTag = e.detail?.target?.closest?.('pk-button[data-tag]')?.getAttribute('data-tag') ?? null; paletteMenu.querySelector('pk-menu-item').toggleAttribute('disabled', !paletteTag); });
    on(paletteMenu, 'pk-select', e => { if (e.target.localName === 'pk-menu-item' && paletteTag) insert(paletteTag); });
    on(paletteList, 'click', e => { const b = e.target.closest?.('pk-button[data-tag]'); if (b) insert(b.getAttribute('data-tag')); });

    // ---- drag-and-drop: canvas reorder (the top-level pk-sortable) and palette -> canvas insert (its external-drop API)
    function clearDropTarget() { state.dropTarget = null; canvas.dropTarget = null; }
    function setDropTarget(id) {
        if (id === state.dropTarget) return;
        clearDropTarget();
        state.dropTarget = id;
        canvas.dropTarget = (id && elements.get(id)) || null;
    }
    // A container a dropped element can go inside: it declares a default slot, is not void, and is not the dragged node's own ancestor (checked by the caller).
    function containerAt(x, y) {
        const id = hit(x, y);
        if (!id) return null;
        const node = M.findNode(current(), id);
        const entry = node && registry.entry(node.tag);
        return entry && !entry.void && entry.slots.some(s => s.name === '' && !s.dynamic) ? id : null;
    }
    on(canvas, 'pk-reorder', e => {
        const { order, item, to, external, payload } = e.detail;
        if (external) { handleExternalInsert(payload, to); return; }
        if (order === null || !item) return;
        const target = { id: item, parent: null, slot: '', index: to };
        const r = attempt('Cannot move', () => M.moveNode(current(), target, registry));
        if (r) { commit(r.doc, 'move', { select: item }); say('Moved'); }
    });
    function handleExternalInsert(payload, at) {
        const tag = payload?.tag;
        if (!tag) return;
        const entry = registry.entry(tag);
        if (!entry) { log.warn(`insert: <${tag}> is not an element the builder knows`); say(`<${tag}> is not an element the builder knows`, 'warn'); return; }
        const parent = state.dropTarget;
        const seed = L.seedSpec(tag, entry.meta);
        const r = attempt(`Cannot add <${tag}>`, () => M.insertNode(current(), parent ? { parent, slot: '', node: seed } : { parent: null, slot: '', index: at, node: seed }, registry));
        if (r) { commit(r.doc, 'insert', { select: r.id }); say(parent ? `Added <${tag}> inside <${M.findNode(current(), parent)?.tag}>` : `Added <${tag}>`); }
    }
    function startExternalDrag(tag, downEvent) {
        const sortable = canvasSortable();
        if (!sortable) return;
        let dragging = false;
        const over = ev => {
            dragging = true;
            canvas.dragging = true;
            // The move/up listeners are on the window (a drag started on a palette button, outside the canvas, has to be tracked past its
            // own bounds), so the event's target is whatever the pointer is really over, or window itself past the document edge: geometry
            // against the canvas's own rectangle is what decides this, not a Node.contains() check (window is not a Node, and throws one).
            const r = canvas.getBoundingClientRect();
            const inCanvas = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
            if (!inCanvas) { clearDropTarget(); return; }
            sortable.externalDragOver(ev.clientX, ev.clientY);
            setDropTarget(containerAt(ev.clientX, ev.clientY));
        };
        const up = ev => {
            win.removeEventListener('pointermove', over);
            win.removeEventListener('pointerup', up);
            const droppedInContainer = Boolean(state.dropTarget);
            if (dragging) sortable.endExternalDrag(!droppedInContainer);
            else sortable.endExternalDrag(false);
            if (dragging && droppedInContainer) handleExternalInsert({ tag }, null);
            clearDropTarget();
            canvas.dragging = false;
        };
        const win = doc.defaultView ?? window;
        sortable.beginExternalDrag({ tag });
        on(win, 'pointermove', over);
        on(win, 'pointerup', up, { once: true });
    }
    on(paletteList, 'pointerdown', e => {
        if (e.button > 0) return;
        const b = e.target.closest?.('pk-button[data-tag]');
        if (b) startExternalDrag(b.getAttribute('data-tag'), e);
    });
    on(search, 'input', () => { state.query = search.value ?? ''; paintPalette(); });
    on(search, 'pk-search', () => { state.query = search.value ?? ''; paintPalette(); });
    on(tree, 'pk-select', e => { const id = e.target.value; if (id) selectNode(id); });
    on(widths, 'click', e => {
        const b = e.target.closest?.('pk-button[data-width]');
        if (!b) return;
        canvas.width = b.getAttribute('data-width');
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
        if (mod && key === 's') { e.preventDefault(); if (options.onsave) save(); return; }
        const inCanvas = canvas.contains(e.target), inTree = tree.contains(e.target);
        if (!inCanvas && !inTree) return;
        if (e.altKey && MOVE_KEYS[e.key]) { e.preventDefault(); move(MOVE_KEYS[e.key]); return; }
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
