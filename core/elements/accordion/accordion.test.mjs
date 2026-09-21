// Unit tests for pk-accordion's exclusive mode, over a stub base (no DOM).
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './accordion.js';

const make = (props, items) => {
    const listeners = []; let adds = 0;
    const el = new (behaviour(class { slotted() { return items; } addEventListener(t, fn) { adds++; listeners.push([t, fn]); } }))();
    Object.assign(el, props);
    return { el, fire: (target, detail) => listeners.filter(([t]) => t === 'pk-toggle').forEach(([, fn]) => fn({ target, detail })), adds: () => adds };
};

test('with exclusive, opening one item closes the others', () => {
    const [a, b, c] = [{ open: true }, { open: true }, { open: false }];
    const { el, fire } = make({ exclusive: true }, [a, b, c]);
    el.connected();
    fire(b, { open: true });
    assert.deepEqual([a.open, b.open, c.open], [false, true, false]);
});

test('closing an item, or a non-exclusive accordion, leaves the others alone', () => {
    const [a, b] = [{ open: true }, { open: true }];
    const one = make({ exclusive: true }, [a, b]); one.el.connected(); one.fire(b, { open: false });
    assert.deepEqual([a.open, b.open], [true, true]);
    const two = make({ exclusive: false }, [a, b]); two.el.connected(); two.fire(b, { open: true });
    assert.deepEqual([a.open, b.open], [true, true]);
});

test('an event without a detail is ignored, and connecting twice listens once', () => {
    const a = { open: true };
    const { el, fire, adds } = make({ exclusive: true }, [a]);
    el.connected(); el.connected();
    assert.equal(adds(), 1);
    assert.doesNotThrow(() => fire({ open: true }, undefined));
    assert.equal(a.open, true);
});
