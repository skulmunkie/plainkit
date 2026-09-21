// Unit tests for pk-timeline: list semantics and the label. Stub base, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './timeline.js';

const make = label => {
    const calls = [];
    const el = new (behaviour(class { aria(m) { calls.push(m); } }))();
    el.label = label;
    return { el, calls };
};

test('the host is a list', () => {
    const { el, calls } = make('');
    el.connected();
    assert.deepEqual(calls, [{ role: 'list' }]);
});

test('the label names the list, and an empty label removes the name', () => {
    const a = make('Order history'); a.el.updated(); assert.deepEqual(a.calls, [{ ariaLabel: 'Order history' }]);
    const b = make(''); b.el.updated(); assert.deepEqual(b.calls, [{ ariaLabel: null }]);
});
