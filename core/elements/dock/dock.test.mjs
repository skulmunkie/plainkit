// pk-dock: the pure panel reading, the tree it draws and the events it raises on a small DOM stand-in, and the meta, css and source held to the standards.
// The computed layout, real separators and the phone strip are checked in the browser suite (tests/browser/cases-dock.js) and the review scenario (dock).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import behaviour, { readPanels, readingOrder, dropZone } from './dock.js';
import { defaultLayout, findGroup, groups, floatPanel, floaters, findFloater } from '../../js/dock-model.js';
import { setLogLevel } from '../../js/log.js';

setLogLevel('silent');

const read = ext => fs.readFileSync(fileURLToPath(new URL(`./dock.${ext}`, import.meta.url)), 'utf8');
const meta = JSON.parse(read('meta.json')); const css = read('css'); const src = read('js');
const child = (slot, extra = {}) => ({ getAttribute: n => (n === 'slot' ? slot : extra[n] ?? null) });

// An in-memory localStorage stand-in (core/tests/store.test.mjs's pattern), so persistence is exercised without touching real storage.
const memoryStorage = (init = {}) => { const m = new Map(Object.entries(init)); return { m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => m.delete(k) }; };

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
    constructor(tag) { this.tag = tag; this.attrs = {}; this.kids = []; this.text = ''; this.listeners = {}; this.style = {}; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return this.attrs[k] ?? null; }
    hasAttribute(k) { return k in this.attrs; }
    toggleAttribute(k, on) { if (on) this.attrs[k] = ''; else delete this.attrs[k]; }
    removeAttribute(k) { delete this.attrs[k]; }
    append(...n) { for (const c of n) c.parent = this; this.kids.push(...n); }
    replaceChildren(...n) { for (const c of n) c.parent = this; this.kids = n; }
    get firstElementChild() { return this.kids[0]; }
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
const el = (tag, cls) => { const n = new Node(tag); n.attrs.class = cls; return n; };
// The group template: a section holding a header (with its collapse-toggle button, a chevron and a title span), a body and a rail-button, cloned per group.
const groupTemplate = () => {
    const s = new Node('section'), h = el('div', 'header'), b = el('div', 'body'), rail = el('button', 'rail-button');
    const toggle = el('button', 'collapse-toggle'), chevron = el('span', 'chevron'), titleSpan = el('span', 'title');
    toggle.kids = [chevron, titleSpan]; h.kids = [toggle]; s.kids = [h, b, rail];
    s.cloneNode = groupTemplate;
    return s;
};
const find = (n, tag, out = []) => { if (n.tag === tag) out.push(n); for (const k of n.kids) find(k, tag, out); return out; };
// dock.html's flyout carries a static Expand button (issue #636, same class/part as a header's own collapse-toggle) ahead of whatever panel slot
// toggleFlyout appends: the build validates meta.parts against exactly this markup, so the stand-in mirrors it rather than letting the element
// create its own button node.
const flyoutExpandButton = () => el('button', 'collapse-toggle');
const make = (panels, props = {}) => {
    const root = new Node('root'), empty = new Node('empty'), status = new Node('status'), toolbar = new Node('toolbar'), flyout = new Node('flyout');
    flyout.append(flyoutExpandButton());
    const parts = { root, empty, status, toolbar, flyout };
    const shadow = { querySelector: () => ({ content: { firstElementChild: groupTemplate() } }), elementFromPoint: () => null };
    const el = new (behaviour(class { emit(name, detail, init = {}) { this.events.push({ name, detail, cancelable: init.cancelable !== false }); return true; } warnOnce() {} part(n) { return parts[n] ?? empty; } get shadowRoot() { return shadow; } requestUpdate() {} slotted() { return []; } toggleAttribute() {} }))();
    Object.assign(el, { events: [], layout: null, label: '', resizeLabel: 'Resize panels', children: panels.map(p => child(p.id, { 'data-heading': p.title, 'data-group': p.group })), ownerDocument: { createElement: t => new Node(t) } });
    Object.assign(el, props);
    globalThis.MutationObserver ??= class { observe() {} disconnect() {} };
    el.connected(); el.updated();
    return { el, root, empty, status, toolbar, flyout };
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

test('every group (whatever its size) gets a panel menu; with company it also lists every other group, Add as tab plus the four dock zones, then Float, before a Close', () => {
    const { el, root } = make(P);
    const [left, , right] = groups(el.$doc);
    assert.equal(left.panels[0], 'tools'); assert.equal(right.panels[0], 'props');
    const dropdowns = find(root, 'pk-dropdown');
    assert.equal(dropdowns.length, 3, 'one per group: left, center (canvas), right');
    const items = find(dropdowns[1], 'pk-menu-item'); // the canvas group's dropdown: two other groups (left, right), then Float, then Close
    assert.deepEqual(items.filter(i => i.getAttribute('type') === 'header').map(i => i.text), ['Toolbox', 'Properties']);
    const values = items.filter(i => i.getAttribute('type') !== 'header').map(i => i.getAttribute('value'));
    assert.deepEqual(values, [...[left, right].flatMap(g => [`tab:canvas:${g.id}`, `dock:canvas:${g.id}:left`, `dock:canvas:${g.id}:right`, `dock:canvas:${g.id}:top`, `dock:canvas:${g.id}:bottom`]), null, 'float:canvas', null, 'close:canvas']);
    assert.equal(items.filter(i => i.getAttribute('type') === 'divider').length, 2, 'a divider separates Move from Float, and Float from Close');
    const single = make([{ id: 'only' }]);
    const soloItems = find(single.root, 'pk-menu-item');
    assert.deepEqual(soloItems.map(i => i.getAttribute('value')), ['float:only', null, 'close:only'], 'a single group offers Float (no other group to move to) and Close');
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

test('collapsing an edge group (props, on the right) folds it to a rail button instead of a header; the centre group (canvas) still gets a header', () => {
    const { el, root } = make(P);
    const propsToggle = find(root, 'button').find(b => b.getAttribute('data-panel') === 'props');
    propsToggle.closest = sel => (sel === 'button' ? propsToggle : null);
    root.listeners.click({ stopPropagation() {}, target: propsToggle });
    assert.deepEqual(el.$doc.collapsed, ['props']);
    const rail = find(root, 'button').find(b => b.getAttribute('data-rail-panel') === 'props');
    assert.ok(rail, 'a rail button replaces the header for the collapsed edge group');
    assert.equal(rail.getAttribute('aria-expanded'), 'false');
    assert.equal(rail.getAttribute('aria-haspopup'), 'true');
    assert.equal(rail.text, 'Properties');
    assert.equal(find(root, 'button').some(b => b.getAttribute('data-panel') === 'props'), false, 'no header chevron left for it');
    // canvas is not at a screen edge (boxed in by left and right columns), so it keeps the accordion-style header-only fold.
    const canvasToggle = find(root, 'button').find(b => b.getAttribute('data-panel') === 'canvas');
    canvasToggle.closest = sel => (sel === 'button' ? canvasToggle : null);
    root.listeners.click({ stopPropagation() {}, target: canvasToggle });
    assert.deepEqual(el.$doc.collapsed, ['props', 'canvas']);
    assert.equal(find(root, 'button').some(b => b.getAttribute('data-rail-panel') === 'canvas'), false, 'canvas stays a header, not a rail');
});

test('a rail button opens the panel as a flyout on click, closes on a second click, and the toggle raises no layout change', () => {
    const { el, root } = make(P);
    const propsToggle = find(root, 'button').find(b => b.getAttribute('data-panel') === 'props');
    propsToggle.closest = sel => (sel === 'button' ? propsToggle : null);
    root.listeners.click({ stopPropagation() {}, target: propsToggle });
    const before = el.events.length;
    const rail = find(root, 'button').find(b => b.getAttribute('data-rail-panel') === 'props');
    rail.closest = sel => (sel === 'button' ? rail : null);
    rail.getBoundingClientRect = () => ({ left: 0, top: 0, right: 40, bottom: 40, width: 40, height: 40 });
    const flyoutEl = el.part('flyout');
    flyoutEl.style = {}; flyoutEl.getBoundingClientRect = () => ({ width: 200, height: 200 });
    globalThis.document ??= { documentElement: { clientWidth: 1024, clientHeight: 768 }, addEventListener() {}, removeEventListener() {} };
    globalThis.getComputedStyle ??= () => ({ direction: 'ltr' });
    root.listeners.click({ stopPropagation() {}, target: rail });
    assert.equal(el.$flyout, 'props', 'the panel opened as a flyout');
    assert.equal(el.events.length, before, 'opening a flyout is a transient view, not a layout change');
    assert.equal(flyoutEl.hidden, false);
    assert.deepEqual(flyoutEl.kids.map(k => k.tag), ['button', 'slot'], 'the Expand button comes before the panel slot');
    assert.deepEqual(find(flyoutEl, 'slot').map(s => s.getAttribute('name')), ['props']);
    assert.equal(flyoutEl.kids[0].getAttribute('data-panel'), 'props', 'the Expand button carries the same data-panel as the panel\'s own header toggle');
    root.listeners.click({ stopPropagation() {}, target: rail });
    assert.equal(el.$flyout, null, 'a second click on the same rail button closes it again');
    assert.equal(flyoutEl.hidden, true);
});

test('the flyout\'s own Expand button, a separate action from opening/closing the flyout, restores the panel to a normal docked header and closes the (now stale) flyout (issue #636)', () => {
    const { el, root } = make(P);
    const propsToggle = find(root, 'button').find(b => b.getAttribute('data-panel') === 'props');
    propsToggle.closest = sel => (sel === 'button' ? propsToggle : null);
    root.listeners.click({ stopPropagation() {}, target: propsToggle }); // collapse props to a rail button
    const rail = find(root, 'button').find(b => b.getAttribute('data-rail-panel') === 'props');
    rail.closest = sel => (sel === 'button' ? rail : null);
    rail.getBoundingClientRect = () => ({ left: 0, top: 0, right: 40, bottom: 40, width: 40, height: 40 });
    const flyoutEl = el.part('flyout');
    flyoutEl.style = {}; flyoutEl.getBoundingClientRect = () => ({ width: 200, height: 200 });
    globalThis.document ??= { documentElement: { clientWidth: 1024, clientHeight: 768 }, addEventListener() {}, removeEventListener() {} };
    globalThis.getComputedStyle ??= () => ({ direction: 'ltr' });
    root.listeners.click({ stopPropagation() {}, target: rail }); // open the flyout
    const before = el.events.length;
    const expandBtn = flyoutEl.kids[0];
    assert.ok(expandBtn, 'the flyout offers an Expand button distinct from the rail button itself');
    expandBtn.closest = sel => (sel === 'button' ? expandBtn : null);
    flyoutEl.listeners.click({ stopPropagation() {}, target: expandBtn }); // the flyout carries its own click listener (dock.html: a sibling of root)
    assert.deepEqual(el.$doc.collapsed, [], 'expandPanel ran: the panel is no longer collapsed');
    assert.deepEqual(el.events.slice(before).map(e => e.detail.reason), ['collapse'], 'restoring from the flyout commits reason collapse, the same as the header chevron');
    assert.equal(el.$flyout, null, 'the stale flyout is closed once the panel is expanded (reflyout finds no rail button left for it)');
    assert.equal(flyoutEl.hidden, true);
    const header = find(root, 'button').find(b => b.getAttribute('data-panel') === 'props');
    assert.ok(header, 'props is drawn as a normal header again, not a rail button');
    assert.equal(find(root, 'button').some(b => b.getAttribute('data-rail-panel') === 'props'), false);
});

test('a click that is not on a collapse-toggle button does nothing', () => {
    const { el, root } = make(P);
    const before = el.events.length;
    const other = { closest: () => null };
    root.listeners.click({ stopPropagation() {}, target: other });
    assert.equal(el.events.length, before);
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

// ---- pointer drag-to-dock (issue 607): dropZone is the pure hit test; onDragStart/onDragMove/onDragEnd are exercised on the same DOM stand-in as
// every other event above, with shadowRoot.elementFromPoint stubbed to say what the pointer is over (a real elementFromPoint only exists in a browser).
const RECT = { left: 100, top: 100, width: 200, height: 100 };
test('dropZone: the outer quarter of each side is that edge, the rest is center; a zero-size rect never throws and stays center', () => {
    assert.equal(dropZone(RECT, 100 + 10, 100 + 50), 'left');
    assert.equal(dropZone(RECT, 100 + 190, 100 + 50), 'right');
    assert.equal(dropZone(RECT, 100 + 100, 100 + 5), 'top');
    assert.equal(dropZone(RECT, 100 + 100, 100 + 95), 'bottom');
    assert.equal(dropZone(RECT, 100 + 100, 100 + 50), 'center');
    assert.equal(dropZone({ left: 0, top: 0, width: 0, height: 0 }, 0, 0), 'center');
});

test('a drag that never moves past the threshold is a no-op: no dragging attribute, no drop zone, no move applied on release', () => {
    const { el, root } = make(P);
    const [left] = groups(el.$doc);
    const groupEl = find(root, 'section').find(s => s.getAttribute('data-node') === left.id);
    const header = groupEl.querySelector('.header');
    header.closest = sel => (sel === '[part="header"]' ? header : sel === '[data-node]' ? groupEl : null);
    el.shadowRoot.elementFromPoint = () => null;
    root.listeners['pointerdown']({ button: 0, pointerId: 1, clientX: 0, clientY: 0, target: { closest: s => (s === 'pk-dropdown, pk-button' ? null : header.closest(s)) } });
    root.listeners['pointermove']({ pointerId: 1, clientX: 1, clientY: 1, preventDefault() {} });
    root.listeners['pointerup']({ pointerId: 1, type: 'pointerup' });
    assert.equal(el.events.length, 0, 'a plain click-sized movement never becomes a move');
});

test('a drag dropped on another group\'s center adds the panel as a tab (moveTab), and on an edge docks it (dockPanel), same as the matching Move menu item', () => {
    const { el, root, status } = make(P);
    const [left, , right] = groups(el.$doc);
    const canvasSection = find(root, 'section').find(s => s.getAttribute('data-node') === findGroup(el.$doc, 'canvas').id);
    const targetSection = find(root, 'section').find(s => s.getAttribute('data-node') === right.id);
    const handle = canvasSection.querySelector('.header');
    handle.closest = sel => (sel === '[part="header"]' ? handle : sel === '[data-node]' ? canvasSection : null);
    handle.setPointerCapture = () => {}; handle.hasPointerCapture = () => true; handle.releasePointerCapture = () => {};
    targetSection.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
    el.shadowRoot.elementFromPoint = () => ({ closest: sel => (sel === '[data-node]' ? targetSection : null) });
    const target = { closest: s => (s === 'pk-dropdown, pk-button' ? null : handle.closest(s)) };
    root.listeners['pointerdown']({ button: 0, pointerId: 2, clientX: 0, clientY: 0, target });
    root.listeners['pointermove']({ pointerId: 2, clientX: 50, clientY: 50, preventDefault() {} }); // dead center of the stubbed rect: zone center
    root.listeners['pointerup']({ pointerId: 2, type: 'pointerup' });
    assert.equal(findGroup(el.$doc, 'canvas').id, right.id, 'canvas landed in the Properties group, added as a tab');
    assert.deepEqual(el.events.map(e => e.detail.reason), ['move']);
    assert.match(status.text, /Canvas added as a tab in Properties/);

    const { el: el2, root: root2, status: status2 } = make(P);
    const canvas2 = find(root2, 'section').find(s => s.getAttribute('data-node') === findGroup(el2.$doc, 'canvas').id);
    const rightSection2 = find(root2, 'section').find(s => s.getAttribute('data-node') === groups(el2.$doc)[2].id);
    const handle2 = canvas2.querySelector('.header');
    handle2.closest = sel => (sel === '[part="header"]' ? handle2 : sel === '[data-node]' ? canvas2 : null);
    handle2.setPointerCapture = () => {}; handle2.hasPointerCapture = () => true; handle2.releasePointerCapture = () => {};
    rightSection2.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
    el2.shadowRoot.elementFromPoint = () => ({ closest: sel => (sel === '[data-node]' ? rightSection2 : null) });
    const target2 = { closest: s => (s === 'pk-dropdown, pk-button' ? null : handle2.closest(s)) };
    root2.listeners['pointerdown']({ button: 0, pointerId: 3, clientX: 0, clientY: 0, target: target2 });
    root2.listeners['pointermove']({ pointerId: 3, clientX: 5, clientY: 50, preventDefault() {} }); // left 5% of the stubbed rect: zone left
    root2.listeners['pointerup']({ pointerId: 3, type: 'pointerup' });
    assert.notEqual(findGroup(el2.$doc, 'canvas').id, groups(el2.$doc)[2]?.id, 'canvas is in a fresh group split to the left of Properties');
    assert.deepEqual(el2.events.map(e => e.detail.reason), ['move']);
    assert.match(status2.text, /Canvas docked left of Properties/);
});

test('a drag cannot land on its own source group: no drop zone is offered there, so releasing over it does nothing', () => {
    const { el, root } = make(P);
    const left = groups(el.$doc)[0];
    const leftSection = find(root, 'section').find(s => s.getAttribute('data-node') === left.id);
    const handle = leftSection.querySelector('.header');
    handle.closest = sel => (sel === '[part="header"]' ? handle : sel === '[data-node]' ? leftSection : null);
    handle.setPointerCapture = () => {}; handle.hasPointerCapture = () => true; handle.releasePointerCapture = () => {};
    el.shadowRoot.elementFromPoint = () => ({ closest: sel => (sel === '[data-node]' ? leftSection : null) });
    const target = { closest: s => (s === 'pk-dropdown, pk-button' ? null : handle.closest(s)) };
    root.listeners['pointerdown']({ button: 0, pointerId: 4, clientX: 0, clientY: 0, target });
    root.listeners['pointermove']({ pointerId: 4, clientX: 50, clientY: 50, preventDefault() {} });
    root.listeners['pointerup']({ pointerId: 4, type: 'pointerup' });
    assert.equal(el.events.length, 0);
});

test('a pointerdown on the panel menu trigger never starts a drag (the menu still opens normally)', () => {
    const { el, root } = make(P);
    const trigger = { closest: s => (s === 'pk-dropdown, pk-button' ? trigger : null) };
    root.listeners['pointerdown']({ button: 0, pointerId: 6, clientX: 0, clientY: 0, target: trigger });
    root.listeners['pointermove']({ pointerId: 6, clientX: 50, clientY: 50, preventDefault() {} });
    root.listeners['pointerup']({ pointerId: 6, type: 'pointerup' });
    assert.equal(el.events.length, 0);
});

test('a single group (nothing to drop on) never starts a drag: onDragStart bails before setPointerCapture is even reached', () => {
    const single = make([{ id: 'only' }]);
    const section = find(single.root, 'section')[0];
    const handle = section.querySelector('.header');
    handle.closest = sel => (sel === '[part="header"]' ? handle : sel === '[data-node]' ? section : null);
    handle.setPointerCapture = () => assert.fail('a lone group has nowhere to dock: no drag should ever start');
    const target = { closest: s => (s === 'pk-dropdown, pk-button' ? null : handle.closest(s)) };
    single.root.listeners['pointerdown']({ button: 0, pointerId: 7, clientX: 0, clientY: 0, target });
});

// ---- floating panels, round 2 item 5 (#618): draws each `floating` entry (js/dock-model.js) as an absolutely-positioned overlay inside root,
// its own group() header doubling as the drag-to-move handle and a corner .floater-resize grip; both share onDragStart/onDragMove/onDragEnd with
// the tab-drag-to-dock tests above (mocking target.closest the same way), settling into one moveFloater/resizeFloater/raiseFloater commit on release.
const floatingLayout = (panel, rect) => floatPanel(defaultLayout(P), { panel, rect, bounds: { w: 400, h: 300 } }).doc;

test('a floating entry draws as an absolutely-positioned section inside root, with its own resize grip, and never appears in the docked tree', () => {
    const doc = floatingLayout('canvas', { x: 10, y: 20, w: 160, h: 120 });
    const { root } = make(P, { layout: doc });
    const id = floaters(doc)[0].id;
    const floater = find(root, 'section').find(s => s.getAttribute('data-floater') === id);
    assert.ok(floater, 'the floater group is drawn inside root');
    assert.deepEqual(floater.style, { left: '10px', top: '20px', width: '160px', height: '120px', zIndex: 1 });
    assert.equal(findGroup(doc, 'canvas'), null, 'canvas left the docked tree for its floater');
    assert.equal(find(floater, 'div').some(d => d.attrs.class === 'floater-resize'), true, 'a resize grip is present');
});

test('dragging a floater\'s header moves it (moveFloater), clamped to root\'s own bounds, and commits reason floater once on release', () => {
    const doc = floatingLayout('canvas', { x: 10, y: 20, w: 160, h: 120 });
    const { el, root } = make(P, { layout: doc });
    const id = floaters(el.$doc)[0].id;
    const floaterEl = find(root, 'section').find(s => s.getAttribute('data-floater') === id);
    const header = floaterEl.querySelector('.header');
    header.closest = sel => (sel === '[data-floater]' ? floaterEl : sel === 'pk-tab, [part="header"]' ? header : null);
    header.setPointerCapture = () => {}; header.hasPointerCapture = () => true; header.releasePointerCapture = () => {};
    root.getBoundingClientRect = () => ({ width: 400, height: 300 });
    const target = { closest: s => (s === 'pk-dropdown, pk-button' ? null : s === '.floater-resize' ? null : header.closest(s)) };
    root.listeners['pointerdown']({ button: 0, pointerId: 10, clientX: 0, clientY: 0, target, stopPropagation() {} });
    root.listeners['pointermove']({ pointerId: 10, clientX: 30, clientY: -5, preventDefault() {} });
    assert.equal(findFloater(el.$doc, id).x, 40); assert.equal(findFloater(el.$doc, id).y, 15, 'live during the drag, no commit yet');
    assert.equal(el.events.length, 0);
    root.listeners['pointerup']({ pointerId: 10, type: 'pointerup' });
    assert.deepEqual(el.events.map(e => e.detail.reason), ['floater']);
    assert.equal(findFloater(el.$doc, id).x, 40);
});

test('dragging a floater\'s resize grip resizes it (resizeFloater) without moving it', () => {
    const doc = floatingLayout('canvas', { x: 10, y: 20, w: 160, h: 120 });
    const { el, root } = make(P, { layout: doc });
    const id = floaters(el.$doc)[0].id;
    const floaterEl = find(root, 'section').find(s => s.getAttribute('data-floater') === id);
    const grip = { closest: sel => (sel === '.floater-resize' ? grip : sel === '[data-floater]' ? floaterEl : null) };
    grip.setPointerCapture = () => {}; grip.hasPointerCapture = () => true; grip.releasePointerCapture = () => {};
    root.getBoundingClientRect = () => ({ width: 400, height: 300 });
    const target = { closest: s => (s === 'pk-dropdown, pk-button' ? null : grip.closest(s)) };
    root.listeners['pointerdown']({ button: 0, pointerId: 11, clientX: 0, clientY: 0, target, stopPropagation() {} });
    root.listeners['pointermove']({ pointerId: 11, clientX: 25, clientY: 10, preventDefault() {} });
    root.listeners['pointerup']({ pointerId: 11, type: 'pointerup' });
    assert.equal(findFloater(el.$doc, id).w, 185); assert.equal(findFloater(el.$doc, id).h, 130);
    assert.equal(findFloater(el.$doc, id).x, 10, 'a resize never moves the floater');
    assert.deepEqual(el.events.map(e => e.detail.reason), ['floater']);
});

test('a pointerdown on any floater raises it to the front (raiseFloater), even without a drag', () => {
    let doc = floatingLayout('canvas', { x: 10, y: 20, w: 160, h: 120 });
    doc = floatPanel(doc, { panel: 'assets', rect: { x: 50, y: 50, w: 150, h: 100 }, bounds: { w: 400, h: 300 } }).doc;
    const { el, root } = make(P, { layout: doc });
    const [first, second] = floaters(el.$doc);
    assert.equal(second.z > first.z, true, 'the later floater starts on top');
    const firstEl = find(root, 'section').find(s => s.getAttribute('data-floater') === first.id);
    const header = firstEl.querySelector('.header');
    header.closest = sel => (sel === '[data-floater]' ? firstEl : sel === 'pk-tab, [part="header"]' ? header : null);
    header.setPointerCapture = () => {}; header.hasPointerCapture = () => true; header.releasePointerCapture = () => {};
    const target = { closest: s => (s === 'pk-dropdown, pk-button' ? null : s === '.floater-resize' ? null : header.closest(s)) };
    root.listeners['pointerdown']({ button: 0, pointerId: 12, clientX: 0, clientY: 0, target, stopPropagation() {} });
    assert.equal(findFloater(el.$doc, first.id).z > findFloater(el.$doc, second.id).z, true, 'raised straight away, before any move or release');
    root.listeners['pointerup']({ pointerId: 12, type: 'pointerup' });
});
