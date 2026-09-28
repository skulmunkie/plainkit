// pk-dock: the pure panel reading, the tree it draws and the events it raises on a small DOM stand-in, and the meta, css and source held to the standards.
// The computed layout, real separators and the phone strip are checked in the browser suite (tests/browser/cases-dock.js) and the review scenario (dock).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import behaviour, { readPanels, readingOrder } from './dock.js';
import { defaultLayout, findGroup, groups } from '../../js/dock-model.js';

const read = ext => fs.readFileSync(fileURLToPath(new URL(`./dock.${ext}`, import.meta.url)), 'utf8');
const meta = JSON.parse(read('meta.json')); const css = read('css'); const src = read('js');
const child = (slot, extra = {}) => ({ getAttribute: n => (n === 'slot' ? slot : extra[n] ?? null) });

test('readPanels takes the slotted children with a usable, unique id, and reads the heading and group hints; the reserved slots (empty, toolbar-start) are never panels', () => {
    const got = readPanels([child('tools', { 'data-heading': 'Toolbox', 'data-group': 'left' }), child('canvas'), child('tools'), child('Bad Id'), child(null), child('9x'), child('a'.repeat(41)), { }, child('empty'), child('toolbar-start')]);
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
    append(...n) { for (const c of n) c.parent = this; this.kids.push(...n); }
    replaceChildren(...n) { for (const c of n) c.parent = this; this.kids = n; }
    addEventListener(t, f) { this.listeners[t] = f; }
    set textContent(v) { this.text = v; }
    closest(sel) { return this.tag === sel ? this : null; }
    focus() { this.focused = true; }
    // A tiny querySelector: matches tag, .class and [attr=value] (any order, all optional but at least one), depth-first.
    querySelector(sel) {
        let tag = '', cls = null, attr = null, want;
        const m = /^([a-z-]*)((?:\.[\w-]+)*)((?:\[[\w-]+(?:=(?:"[^"]*"|[^\]]*))?\])*)$/.exec(sel.trim());
        if (!m) return null;
        [, tag, ] = m;
        const clsM = m[2] && [...m[2].matchAll(/\.([\w-]+)/g)].map(x => x[1]);
        cls = clsM && clsM[0];
        const attrM = /\[([\w-]+)(?:=(?:"([^"]*)"|([^\]]*)))?\]/.exec(m[3] ?? '');
        if (attrM) { attr = attrM[1]; want = attrM[2] ?? attrM[3]; }
        const test = n => (!tag || n.tag === tag) && (!cls || (n.attrs.class ?? '').split(/\s+/).includes(cls)) && (!attr || (want === undefined ? n.getAttribute(attr) != null : n.getAttribute(attr) === want));
        const walk = n => { if (test(n)) return n; for (const k of n.kids) { const f = walk(k); if (f) return f; } return null; };
        for (const k of this.kids) { const f = walk(k); if (f) return f; }
        return null;
    }
    remove() { this.removed = true; if (this.parent) this.parent.kids = this.parent.kids.filter(k => k !== this); }
}
// The group template: a section holding a header and a body, cloned per group.
const groupTemplate = () => { const s = new Node('section'), h = new Node('div'), b = new Node('div'); s.kids = [h, b]; s.querySelector = sel => (sel === '.header' ? h : b); s.cloneNode = groupTemplate; return s; };
const find = (n, tag, out = []) => { if (n.tag === tag) out.push(n); for (const k of n.kids) find(k, tag, out); return out; };
const make = (panels, props = {}) => {
    const root = new Node('root'), empty = new Node('empty'), status = new Node('status'), toolbar = new Node('toolbar'), parts = { root, empty, status, toolbar };
    const el = new (behaviour(class { emit(name, detail, init = {}) { this.events.push({ name, detail, cancelable: init.cancelable !== false }); return true; } warnOnce() {} part(n) { return parts[n] ?? empty; } get shadowRoot() { return { querySelector: () => ({ content: { firstElementChild: groupTemplate() } }) }; } requestUpdate() {} slotted() { return []; } }))();
    Object.assign(el, { events: [], layout: null, label: '', resizeLabel: 'Resize panels', children: panels.map(p => child(p.id, { 'data-heading': p.title, 'data-group': p.group })), ownerDocument: { createElement: t => new Node(t) } });
    Object.assign(el, props);
    globalThis.MutationObserver ??= class { observe() {} disconnect() {} };
    el.connected(); el.updated();
    return { el, root, empty, status, toolbar };
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

test('confirmLayout, when set, holds a resize until it settles: nothing fires or applies until then, and the confirmed json wins', async () => {
    const { el, root } = make(P);
    const calls = [];
    let resolve;
    el.confirmLayout = arg => { calls.push(arg); return new Promise(r => { resolve = r; }); };
    const split = find(root, 'pk-splitter')[0];
    split.closest = () => split;
    root.listeners['pk-resize']({ stopPropagation() {}, target: split, detail: { size: 30 } });
    assert.equal(calls.length, 1); assert.equal(calls[0].reason, 'resize'); assert.equal(JSON.parse(calls[0].layout).root.size, 30);
    assert.equal(el.events.length, 0); assert.equal(el.layout, null); // nothing applied yet: layout is still what the host gave it
    const confirmed = JSON.parse(calls[0].layout); confirmed.root.size = 45;
    resolve(JSON.stringify(confirmed));
    await Promise.resolve(); await Promise.resolve();
    assert.equal(el.events.length, 1); assert.equal(el.events[0].detail.reason, 'resize');
    assert.equal(el.layout.root.size, 45); // the settled value, not the proposed one
});

test('confirmLayout resolving with null keeps the previous layout and applies it', async () => {
    const { el, root } = make(P);
    el.confirmLayout = () => Promise.resolve(null);
    const split = find(root, 'pk-splitter')[0];
    split.closest = () => split;
    const before = el.$applied;
    root.listeners['pk-resize']({ stopPropagation() {}, target: split, detail: { size: 30 } });
    await Promise.resolve(); await Promise.resolve();
    assert.equal(el.events.length, 1);
    assert.deepEqual(el.layout, before); // the doc from before the proposed resize, not the rejected one
});

test('a rejected confirmLayout keeps the previous layout and raises nothing', async () => {
    const { el, root } = make(P);
    el.confirmLayout = () => Promise.reject(new Error('offline'));
    const split = find(root, 'pk-splitter')[0];
    split.closest = () => split;
    const before = el.$applied;
    root.listeners['pk-resize']({ stopPropagation() {}, target: split, detail: { size: 30 } });
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    assert.equal(el.events.length, 0);
    assert.equal(el.$doc, before);
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

test('every group (whatever its size) gets a panel menu; with company it also lists every other group, Add as tab plus the four dock zones, before a Close', () => {
    const { el, root } = make(P);
    const [left, , right] = groups(el.$doc);
    assert.equal(left.panels[0], 'tools'); assert.equal(right.panels[0], 'props');
    const dropdowns = find(root, 'pk-dropdown');
    assert.equal(dropdowns.length, 3, 'one per group: left, center (canvas), right');
    const items = find(dropdowns[1], 'pk-menu-item'); // the canvas group's dropdown: two other groups (left, right), then Close
    assert.deepEqual(items.filter(i => i.getAttribute('type') === 'header').map(i => i.text), ['Toolbox', 'Properties']);
    const values = items.filter(i => i.getAttribute('type') !== 'header').map(i => i.getAttribute('value'));
    assert.deepEqual(values, [...[left, right].flatMap(g => [`tab:canvas:${g.id}`, `dock:canvas:${g.id}:left`, `dock:canvas:${g.id}:right`, `dock:canvas:${g.id}:top`, `dock:canvas:${g.id}:bottom`]), null, 'close:canvas']);
    assert.equal(items.find(i => i.getAttribute('type') === 'divider') !== undefined, true, 'a divider separates Move from Close');
    const single = make([{ id: 'only' }]);
    const soloItems = find(single.root, 'pk-menu-item');
    assert.deepEqual(soloItems.map(i => i.getAttribute('value')), ['close:only'], 'a single group offers only Close, no Move items and no divider');
});

test('choosing "Add as tab" moves the panel with moveTab, commits reason move and announces the result', () => {
    const { el, root, status } = make(P);
    const target = findGroup(el.$doc, 'props').id;
    root.listeners['pk-select']({ stopPropagation() {}, detail: { value: `tab:canvas:${target}` } });
    assert.equal(findGroup(el.$doc, 'canvas').id, target);
    assert.equal(findGroup(el.$doc, 'canvas').active, 'canvas');
    assert.deepEqual(el.events.map(e => e.detail.reason), ['move']);
    assert.match(status.text, /Canvas added as a tab in Properties/);
});

test('choosing a dock zone moves the panel with dockPanel and commits reason move', () => {
    const { el, root, status } = make(P);
    const target = findGroup(el.$doc, 'props').id;
    root.listeners['pk-select']({ stopPropagation() {}, detail: { value: `dock:canvas:${target}:top` } });
    assert.notEqual(findGroup(el.$doc, 'canvas').id, target, 'canvas is now in its own new group, split above props');
    assert.deepEqual(el.events.map(e => e.detail.reason), ['move']);
    assert.match(status.text, /Canvas docked above Properties/);
    assert.equal(groups(el.$doc).length, 3, 'canvas left its old group (which collapses) for a fresh one split above props');
});

test('choosing "Close" drops the panel from its group (repairing the layout, reason panels), shows the toolbar\'s Panels menu, and reopening puts it back and clears the toolbar', () => {
    const { el, root, status, toolbar } = make(P);
    assert.equal(toolbar.hidden, true, 'nothing closed yet: the toolbar stays hidden');
    root.listeners['pk-select']({ stopPropagation() {}, detail: { value: 'close:canvas' } });
    assert.equal(findGroup(el.$doc, 'canvas'), null, 'canvas is no longer in any group');
    assert.deepEqual(el.events.map(e => e.detail.reason), ['panels']);
    assert.match(status.text, /Canvas closed/);
    assert.equal(toolbar.hidden, false, 'a closed panel shows the toolbar');
    const openItem = find(toolbar, 'pk-menu-item').find(i => i.getAttribute('value') === 'open:canvas');
    assert.ok(openItem, 'the Panels menu offers to reopen it'); assert.equal(openItem.text, 'Open Canvas');
    toolbar.listeners['pk-select']({ stopPropagation() {}, detail: { value: 'open:canvas' } });
    assert.ok(findGroup(el.$doc, 'canvas'), 'canvas is back in a group');
    assert.deepEqual(el.events.map(e => e.detail.reason), ['panels', 'panels']);
    assert.match(status.text, /Canvas opened/);
    assert.equal(toolbar.hidden, true, 'nothing closed any more: hidden again');
});

test('the toolbar keeps a stable toolbar-start slot for a host app\'s own menus: it shows the toolbar even with nothing closed, and the Panels menu still works alongside it', () => {
    const { el, toolbar } = make(P);
    assert.equal(toolbar.hidden, true, 'empty slot, nothing closed: no toolbar');
    el.slotted = name => (name === 'toolbar-start' ? [{ tag: 'pk-button' }] : []);
    el.updated(); // a toolbar-start child is part of the update key too, so a slotchange (any DOM mutation the element observes) redraws it
    assert.equal(toolbar.hidden, false, 'the host slotted something: the toolbar shows for it alone');
    el.closePanel('canvas');
    assert.equal(toolbar.hidden, false);
    assert.ok(find(toolbar, 'pk-dropdown').length, 'the Panels menu still appears next to whatever the host put in toolbar-start');
    el.openPanel('canvas');
    assert.equal(toolbar.hidden, false, 'nothing closed, but the slot still holds something: stays shown');
    assert.equal(find(toolbar, 'pk-dropdown').length, 0, 'the Panels menu itself is gone once nothing is closed');
});

test('closing every panel empties the layout (the empty state shows) without losing any of them: the toolbar can still reopen each one', () => {
    const { el, empty, toolbar } = make(P);
    for (const p of P) el.closePanel(p.id);
    assert.equal(el.$doc.root, null);
    assert.equal(empty.hidden, false);
    assert.deepEqual(find(toolbar, 'pk-menu-item').map(i => i.getAttribute('value')), P.map(p => `open:${p.id}`));
    el.openPanel('canvas');
    assert.ok(findGroup(el.$doc, 'canvas'));
    assert.equal(empty.hidden, true);
});

test('closing an id that is not open, or reopening an id that is not closed, does nothing (no event, no announcement)', () => {
    const { el, status } = make(P);
    el.closePanel('nope'); // not a declared panel at all
    el.openPanel('canvas'); // not closed
    assert.equal(el.events.length, 0);
    assert.equal(status.text, '');
});

test('an unusable pk-select value (not ours, or an unknown group) is left alone and raises nothing', () => {
    const { el, root } = make(P);
    root.listeners['pk-select']({ stopPropagation() {}, detail: { value: 'not-ours' } });
    root.listeners['pk-select']({ stopPropagation() {}, detail: { value: 'tab:canvas:no-such-group' } });
    assert.equal(el.events.length, 0);
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
