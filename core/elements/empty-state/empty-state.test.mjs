// Unit tests for pk-empty-state: which regions show, and the optional status role. Stub base, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './empty-state.js';

// `slots` maps a slot name ('' = default) to the nodes assigned to it.
const make = (props = {}, slots = {}) => {
    const parts = { heading: { hidden: null }, description: { hidden: null }, icon: { hidden: null }, actions: { hidden: null } }; const watched = [];
    const shadowRoot = { querySelector: sel => { const m = /name="([^"]+)"/.exec(sel); return { assignedNodes: () => slots[m ? m[1] : ''] ?? [] }; } };
    const el = new (behaviour(class { part(n) { return parts[n]; } aria(m) { this.ariaSet = m; } watchSlot(n) { watched.push(n); } requestUpdate() {} }))();
    Object.assign(el, { heading: '', description: '', announce: false, shadowRoot }, props);
    return { el, parts, watched };
};
const text = t => ({ nodeType: 3, textContent: t });
const elem = () => ({ nodeType: 1, textContent: '' });

test('with nothing given every region is hidden', () => {
    const { el, parts } = make();
    el.updated();
    assert.deepEqual(Object.values(parts).map(p => p.hidden), [true, true, true, true]);
});

test('props show the heading and description; slots show all four regions', () => {
    const p = make({ heading: 'No results', description: 'Try again' }); p.el.updated();
    assert.equal(p.parts.heading.hidden, false); assert.equal(p.parts.description.hidden, false); assert.equal(p.parts.icon.hidden, true);
    const s = make({}, { heading: [elem()], '': [text('Nothing yet')], icon: [elem()], actions: [elem()] }); s.el.updated();
    assert.deepEqual(Object.values(s.parts).map(x => x.hidden), [false, false, false, false]);
});

test('blank text in a slot does not count as content', () => {
    const { el, parts } = make({}, { '': [text('  \n ')], actions: [text('')] });
    el.updated();
    assert.equal(parts.description.hidden, true); assert.equal(parts.actions.hidden, true);
});

test('announce turns the box into a status region, otherwise it has no role', () => {
    const a = make({ announce: true }); a.el.updated(); assert.deepEqual(a.el.ariaSet, { role: 'status' });
    const b = make(); b.el.updated(); assert.deepEqual(b.el.ariaSet, { role: null });
});

test('all four slots are watched so a late child updates the layout', () => {
    const { el, watched } = make();
    el.connected();
    assert.deepEqual(watched.sort(), ['', 'actions', 'heading', 'icon']);
});
