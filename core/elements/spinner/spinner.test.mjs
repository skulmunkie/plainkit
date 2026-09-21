// Unit tests for pk-spinner: it is announced as a status region. Stub base, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './spinner.js';

test('connecting gives the spinner the status role', () => {
    const el = new (behaviour(class { aria(m) { this.ariaSet = m; } }))();
    el.connected();
    assert.deepEqual(el.ariaSet, { role: 'status' });
});
