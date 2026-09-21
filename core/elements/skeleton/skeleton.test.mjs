// Unit tests for pk-skeleton: props become CSS custom properties. Stub base, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './skeleton.js';

const make = props => {
    const vars = {};
    const el = new (behaviour(class { get style() { return { setProperty: (k, v) => { vars[k] = v; }, removeProperty: k => { delete vars[k]; } }; } }))();
    Object.assign(el, props);
    return { el, vars };
};

test('lines becomes the line-count variable as text', () => {
    const { el, vars } = make({ lines: 3, size: '' });
    el.updated();
    assert.equal(vars['--pk-skeleton-lines'], '3');
});

test('size sets its variable and clearing it removes the variable', () => {
    const { el, vars } = make({ lines: 1, size: '2rem' });
    el.updated();
    assert.equal(vars['--pk-skeleton-size'], '2rem');
    el.size = ''; el.updated();
    assert.equal('--pk-skeleton-size' in vars, false);
});
