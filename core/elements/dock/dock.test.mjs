// pk-dock: the pure panel reading, the tree it draws and the events it raises on a small DOM stand-in, and the meta, css and source held to the standards.
// The computed layout, real separators and the phone strip are checked in the browser suite (tests/browser/cases-dock.js) and the review scenario (dock).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import behaviour, { readPanels, readingOrder } from './dock.js';
import { defaultLayout, findGroup } from '../../js/dock-model.js';
import { setLogLevel } from '../../js/log.js';

setLogLevel('silent');

const read = ext => fs.readFileSync(fileURLToPath(new URL(`./dock.${ext}`, import.meta.url)), 'utf8');
const meta = JSON.parse(read('meta.json')); const css = read('css'); const src = read('js');
const child = (slot, extra = {}) => ({ getAttribute: n => (n === 'slot' ? slot : extra[n] ?? null) });

// An in-memory localStorage stand-in (core/tests/store.test.mjs's pattern), so persistence is exercised without touching real storage.
const memoryStorage = (init = {}) => { const m = new Map(Object.entries(init)); return { m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => m.delete(k) }; };

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
}
// The group template: a section holding a header and a body, cloned per group.
const groupTemplate = () => { const s = new Node('section'), h = new Node('div'), b = new Node('div'); s.kids = [h, b]; s.querySelector = sel => (sel === '.header' ? h : b); s.cloneNode = groupTemplate; return s; };
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

test('persistKey saves the committed layout and restores it on a later connect, but not a layout the host sets', () => {
    const saved = globalThis.localStorage;
    try {
        globalThis.localStorage = memoryStorage();
        const first = make(P, { persistKey: 'demo' });
        const split = find(first.root, 'pk-splitter')[0];
        split.closest = () => split;
        first.root.listeners['pk-resize']({ stopPropagation() {}, target: split, detail: { size: 33 } });
        assert.equal(first.el.layout.root.size, 33);
        assert.ok(globalThis.localStorage.m.has('pk-dock:demo.layout'), 'the commit was persisted');
        first.el.disconnected();

        const second = make(P, { persistKey: 'demo' });
        assert.equal(second.el.layout.root.size, 33, 'a fresh element with no layout prop restores the saved layout');

        const before = JSON.parse(globalThis.localStorage.m.get('pk-dock:demo.layout')).data.layout.root.size;
        const third = make(P, { persistKey: 'demo', layout: defaultLayout(P) });
        assert.notEqual(third.el.layout.root.size, before, 'a layout the host sets is used as-is, not overridden by storage');
        assert.equal(JSON.parse(globalThis.localStorage.m.get('pk-dock:demo.layout')).data.layout.root.size, before, 'and a host-set layout is not itself persisted');
    } finally { if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved; }
});

test('no persistKey never touches storage; a bad or hostile stored layout falls back quietly', () => {
    const saved = globalThis.localStorage;
    try {
        globalThis.localStorage = memoryStorage();
        make(P);
        assert.equal(globalThis.localStorage.m.size, 0, 'no persistKey means no store module');

        globalThis.localStorage = memoryStorage({ 'pk-dock:demo.layout': '{not json' });
        const { el } = make(P, { persistKey: 'demo' });
        assert.ok(el.$doc.root, 'corrupt storage falls back to the default layout, not a throw');
    } finally { if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved; }
});

test('disconnected() releases the persistence store: a later commit while disconnected is not saved', () => {
    const saved = globalThis.localStorage;
    try {
        globalThis.localStorage = memoryStorage();
        const { el, root } = make(P, { persistKey: 'demo' });
        el.disconnected();
        assert.equal(el.$mod, undefined);
        const split = find(root, 'pk-splitter')[0];
        split.closest = () => split;
        root.listeners['pk-resize']({ stopPropagation() {}, target: split, detail: { size: 40 } });
        assert.equal(globalThis.localStorage.m.has('pk-dock:demo.layout'), false, 'commit() after disconnected has no store to write to');
    } finally { if (saved === undefined) delete globalThis.localStorage; else globalThis.localStorage = saved; }
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
