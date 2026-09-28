// pk-dock: the pure panel reading, the tree it draws and the events it raises on a small DOM stand-in, and the meta, css and source held to the standards.
// The computed layout, real separators and the phone strip are checked in the browser suite (tests/browser/cases-dock.js) and the review scenario (dock).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import behaviour, { readPanels, readingOrder } from './dock.js';
import { defaultLayout, findGroup } from '../../js/dock-model.js';

const read = ext => fs.readFileSync(fileURLToPath(new URL(`./dock.${ext}`, import.meta.url)), 'utf8');
const meta = JSON.parse(read('meta.json')); const css = read('css'); const src = read('js');
const child = (slot, extra = {}) => ({ getAttribute: n => (n === 'slot' ? slot : extra[n] ?? null) });

test('readPanels takes the slotted children with a usable, unique id, and reads the heading and group hints', () => {
    const got = readPanels([child('tools', { 'data-heading': 'Toolbox', 'data-group': 'left' }), child('canvas'), child('tools'), child('Bad Id'), child(null), child('9x'), child('a'.repeat(41)), { }]);
    assert.deepEqual(got, [{ id: 'tools', title: 'Toolbox', group: 'left' }, { id: 'canvas', title: 'canvas', group: 'center' }]);
});

test('readingOrder lists the panels start before end', () => {
    const d = defaultLayout([{ id: 'r', group: 'right' }, { id: 'l', group: 'left' }, { id: 'c' }, { id: 'b', group: 'bottom' }]);
    assert.deepEqual(readingOrder(d), ['l', 'c', 'r', 'b']);
});

// A stand-in for the DOM the element builds: nodes with attributes, children and text, enough to read the tree back.
class Node {
    constructor(tag) { this.tag = tag; this.attrs = {}; this.kids = []; this.text = ''; this.listeners = {}; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return this.attrs[k] ?? null; }
    append(...n) { this.kids.push(...n); }
    replaceChildren(...n) { this.kids = n; }
    addEventListener(t, f) { this.listeners[t] = f; }
    set textContent(v) { this.text = v; }
    closest(sel) { return this.tag === sel ? this : null; }
    remove() { this.removed = true; }
    // A minimal class-selector query, recursive, enough for the template's own lookups ('.header', '.body', '.collapse-toggle', '.title').
    querySelector(sel) {
        const cls = sel.replace(/^\./, '');
        const search = n => { for (const k of n.kids) { if (k.attrs.class === cls) return k; const r = search(k); if (r) return r; } return null; };
        return search(this);
    }
}
const el = (tag, cls) => { const n = new Node(tag); n.attrs.class = cls; return n; };
// The group template: a section holding a header (with its collapse-toggle button, a chevron and a title span) and a body, cloned per group.
const groupTemplate = () => {
    const s = new Node('section'), h = el('div', 'header'), b = el('div', 'body');
    const toggle = el('button', 'collapse-toggle'), chevron = el('span', 'chevron'), titleSpan = el('span', 'title');
    toggle.kids = [chevron, titleSpan]; h.kids = [toggle]; s.kids = [h, b];
    s.cloneNode = groupTemplate;
    return s;
};
const find = (n, tag, out = []) => { if (n.tag === tag) out.push(n); for (const k of n.kids) find(k, tag, out); return out; };
const make = (panels, props = {}) => {
    const root = new Node('root'), empty = new Node('empty');
    const el = new (behaviour(class { emit(name, detail, init = {}) { this.events.push({ name, detail, cancelable: init.cancelable !== false }); return true; } warnOnce() {} part(n) { return n === 'root' ? root : empty; } get shadowRoot() { return { querySelector: () => ({ content: { firstElementChild: groupTemplate() } }) }; } requestUpdate() {} }))();
    Object.assign(el, { events: [], layout: null, label: '', resizeLabel: 'Resize panels', children: panels.map(p => child(p.id, { 'data-heading': p.title, 'data-group': p.group })), ownerDocument: { createElement: t => new Node(t) } });
    Object.assign(el, props);
    globalThis.MutationObserver ??= class { observe() {} disconnect() {} };
    el.connected(); el.updated();
    return { el, root, empty };
};
const P = [{ id: 'tools', title: 'Toolbox', group: 'left' }, { id: 'assets', title: 'Assets', group: 'left' }, { id: 'canvas', title: 'Canvas' }, { id: 'props', title: 'Properties', group: 'right' }];

test('the default layout draws splitters for splits, tabs for groups of several panels and a titled section for one', () => {
    const { root, empty } = make(P);
    assert.equal(empty.hidden, true);
    const splitters = find(root, 'pk-splitter');
    assert.equal(splitters.length, 2); assert.equal(splitters[0].getAttribute('size'), '20'); assert.equal(splitters[0].getAttribute('label'), 'Resize panels');
    assert.deepEqual(find(root, 'pk-tab').map(t => t.text), ['Toolbox', 'Assets']);
    assert.equal(find(root, 'section').length, 3);
    assert.deepEqual(find(root, 'slot').map(s => s.getAttribute('name')), ['tools', 'assets', 'canvas', 'props']);
});

test('a resize commits one pk-layout-change with the new document and stops the inner event', () => {
    const { el, root } = make(P);
    const split = find(root, 'pk-splitter')[0]; let stopped = false;
    split.closest = () => split;
    root.listeners['pk-resize']({ stopPropagation() { stopped = true; }, target: split, detail: { size: 30 } });
    assert.equal(stopped, true);
    assert.equal(el.events.length, 1);
    assert.equal(el.events[0].name, 'pk-layout-change'); assert.equal(el.events[0].detail.reason, 'resize'); assert.equal(el.events[0].cancelable, false);
    assert.equal(el.layout.root.size, 30); assert.equal(el.events[0].detail.layout, el.layout);
});

test('choosing a tab activates the panel in the model and commits; a phone strip does not touch the layout', () => {
    const { el, root } = make(P);
    const section = find(root, 'section').find(s => s.getAttribute('data-node') === findGroup(el.$doc, 'tools').id);
    const target = { closest: () => section };
    root.listeners['pk-tab-change']({ stopPropagation() {}, target, detail: { value: 'assets' } });
    assert.equal(findGroup(el.$doc, 'assets').active, 'assets');
    assert.deepEqual(el.events.map(e => e.detail.reason), ['activate']);
    const phone = { getAttribute: () => 'phone' };
    root.listeners['pk-tab-change']({ stopPropagation() {}, target: { closest: () => phone }, detail: { value: 'props' } });
    assert.equal(el.events.length, 1);
});

test('a layout the host sets raises nothing; a panel that appears is added and raises reason panels', () => {
    const { el, root } = make(P);
    const before = el.events.length;
    el.layout = defaultLayout(P.map(p => ({ id: p.id })));
    el.updated();
    assert.equal(el.events.length, before);
    assert.equal(find(root, 'pk-splitter').length, 0, 'all four panels in one group');
    el.children = [...el.children, child('extra')];
    el.updated();
    assert.deepEqual(el.events.map(e => e.detail.reason), ['panels']);
    assert.ok(findGroup(el.layout, 'extra'));
});

test('a single-panel header has a collapse-toggle button naming its title, aria-expanded and the body it controls', () => {
    const { root } = make(P);
    // A multi-panel group's header (with its own unused template button) is detached by the real .remove(); this stand-in only flags it removed,
    // so tell the wired-up ones (they carry data-panel) from the leftover template button of the tools/assets tab group.
    const toggles = find(root, 'button').filter(b => b.getAttribute('data-panel'));
    assert.equal(toggles.length, 2, 'the two single-panel groups (canvas, props); tools/assets is a tab group with no chevron yet');
    const canvasToggle = toggles.find(b => b.getAttribute('data-panel') === 'canvas');
    assert.equal(canvasToggle.getAttribute('aria-expanded'), 'true');
    assert.ok(canvasToggle.getAttribute('aria-controls'));
    assert.deepEqual(find(canvasToggle, 'span').map(s => s.text), ['', 'Canvas']);
});

test('clicking the collapse-toggle folds the panel, commits reason collapse, and toggling back expands it', () => {
    const { el, root } = make(P);
    const btn = find(root, 'button').find(b => b.getAttribute('data-panel') === 'canvas');
    btn.closest = sel => (sel === 'button' ? btn : null);
    root.listeners.click({ stopPropagation() {}, target: btn });
    assert.deepEqual(el.$doc.collapsed, ['canvas']);
    assert.deepEqual(el.events.map(e => e.detail.reason), ['collapse']);
    const bodyAfter = find(root, 'div').find(n => n.id === btn.getAttribute('aria-controls'));
    assert.equal(bodyAfter.hidden, true);
    const toggleAfter = find(root, 'button').find(b => b.getAttribute('data-panel') === 'canvas');
    assert.equal(toggleAfter.getAttribute('aria-expanded'), 'false');
    toggleAfter.closest = sel => (sel === 'button' ? toggleAfter : null);
    root.listeners.click({ stopPropagation() {}, target: toggleAfter });
    assert.deepEqual(el.$doc.collapsed, []);
    assert.deepEqual(el.events.map(e => e.detail.reason), ['collapse', 'collapse']);
});

test('a click that is not on a collapse-toggle button does nothing', () => {
    const { el, root } = make(P);
    const before = el.events.length;
    const other = { closest: () => null };
    root.listeners.click({ stopPropagation() {}, target: other });
    assert.equal(el.events.length, before);
});

test('no panels shows the empty state', () => {
    const { empty, root } = make([]);
    assert.equal(empty.hidden, false); assert.equal(root.kids.length, 0);
});

test('the meta names its commit event, the panel slot and the layout prop', () => {
    assert.equal(meta.props.find(p => p.name === 'layout').commit, 'pk-layout-change');
    assert.ok(meta.events.some(e => e.name === 'pk-layout-change' && e.detailProps.reason === 'string'));
    assert.match(meta.a11y, /role=separator/);
    assert.ok(meta.examples.length >= 2);
});

test('the css uses tokens only and logical properties', () => {
    assert.ok(!/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i.test(css), 'literal colour');
    assert.ok(!/\b(margin|padding|border)-(left|right|top|bottom)\b|(?<![-\w])(width|height)\s*:/.test(css), 'physical properties');
    assert.ok(css.includes(':host([hidden])'));
});

test('the source keeps its one outside subscription (the phone media query) removed on disconnect and logs through the element', () => {
    assert.ok(src.includes('removeEventListener') && src.includes('disconnect()'));
    assert.ok(!/console\./.test(src) && !/innerHTML/.test(src));
});
