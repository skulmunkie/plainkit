// Unit tests for pk-tab-panel: the panel slot and the tabpanel role. Stub base, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './tab-panel.js';

const make = slot => {
    const el = new (behaviour(class { aria(m) { this.ariaSet = m; } }))();
    el.slot = slot;
    return el;
};

test('connecting puts the panel in the panel slot of its tabs, unless it already names one', () => {
    const a = make(''); a.connected(); assert.equal(a.slot, 'panel');
    const b = make('custom'); b.connected(); assert.equal(b.slot, 'custom');
});

test('the host has the tabpanel role', () => {
    const el = make('panel');
    el.connected();
    assert.deepEqual(el.ariaSet, { role: 'tabpanel' });
});
