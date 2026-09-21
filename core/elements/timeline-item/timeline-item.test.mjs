// Unit tests for pk-timeline-item: listitem role and the body hiding when nothing is slotted. Stub base, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './timeline-item.js';

const make = nodes => {
    const body = { hidden: null }; const calls = []; let queried = null;
    const el = new (behaviour(class { part() { return body; } aria(m) { calls.push(m); } watchSlot() {} requestUpdate() {} }))();
    el.shadowRoot = { querySelector: sel => { queried = sel; return { assignedNodes: () => nodes }; } };
    return { el, body, calls, queried: () => queried };
};

test('the item is a listitem', () => {
    const { el, calls } = make([]);
    el.connected();
    assert.deepEqual(calls, [{ role: 'listitem' }]);
});

test('the body is hidden when the default slot has nothing or only blank text', () => {
    const a = make([]); a.el.updated(); assert.equal(a.body.hidden, true);
    const b = make([{ nodeType: 3, textContent: '  \n' }]); b.el.updated(); assert.equal(b.body.hidden, true);
    assert.equal(a.queried(), 'slot:not([name])');
});

test('an element or non-blank text shows the body', () => {
    const a = make([{ nodeType: 1, textContent: '' }]); a.el.updated(); assert.equal(a.body.hidden, false);
    const b = make([{ nodeType: 3, textContent: 'Shipped' }]); b.el.updated(); assert.equal(b.body.hidden, false);
});
