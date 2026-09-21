// Unit tests for pk-divider: the labelled marker and the separator semantics. Stub base, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './divider.js';

const make = (props, slotted = [], text = '') => {
    const attrs = {};
    const el = new (behaviour(class { slotted() { return slotted; } aria(m) { this.ariaSet = m; } toggleAttribute(n, on) { attrs[n] = on; } watchSlot() {} requestUpdate() {} }))();
    Object.assign(el, { decorative: false, vertical: false, textContent: text }, props);
    return { el, attrs };
};

test('an unlabelled divider is a horizontal separator', () => {
    const { el, attrs } = make();
    el.updated();
    assert.deepEqual(el.ariaSet, { role: 'separator', ariaOrientation: 'horizontal' });
    assert.equal(attrs['data-labelled'], false);
});

test('vertical changes the announced orientation', () => {
    const { el } = make({ vertical: true });
    el.updated();
    assert.equal(el.ariaSet.ariaOrientation, 'vertical');
});

test('decorative drops the separator semantics', () => {
    const { el } = make({ decorative: true, vertical: true });
    el.updated();
    assert.deepEqual(el.ariaSet, { role: 'none' });
});

test('a slotted element or non-blank text marks it labelled; whitespace does not', () => {
    const a = make({}, [{}]); a.el.updated(); assert.equal(a.attrs['data-labelled'], true);
    const b = make({}, [], 'or'); b.el.updated(); assert.equal(b.attrs['data-labelled'], true);
    const c = make({}, [], '  \n '); c.el.updated(); assert.equal(c.attrs['data-labelled'], false);
});
