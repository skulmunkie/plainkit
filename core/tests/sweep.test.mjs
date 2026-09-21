// The size sweep's pure parts: the count of level-1 headings (real h1 elements and role="heading" aria-level="1", inside shadow trees too) and the routes it visits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { countH1, routes, WIDTHS, THEMES } from '../site/scorecard/sweep.js';

const flatten = kids => kids.flatMap(k => [k, ...k.querySelectorAll('*')]);
const el = (localName, attrs = {}, kids = [], shadow = null) => ({ localName, getAttribute: n => attrs[n] ?? null, shadowRoot: shadow, querySelectorAll: () => flatten(kids) });
const root = kids => ({ querySelectorAll: () => flatten(kids) });

test('countH1 counts h1 elements and level-1 role=heading, in the light tree and in shadow trees, and nothing else', () => {
    assert.equal(countH1(root([])), 0);
    assert.equal(countH1(root([el('h1'), el('h2'), el('div', { role: 'heading', 'aria-level': '2' })])), 1);
    assert.equal(countH1(root([el('div', { role: 'heading', 'aria-level': '1' })])), 1);
    const header = el('pk-page-header', {}, [], root([el('div', { role: 'heading', 'aria-level': '1' })]));
    assert.equal(countH1(root([header])), 1, 'the title pk-page-header draws in its shadow tree is the page h1');
    assert.equal(countH1(root([header, el('h1')])), 2, 'two level-1 headings are counted as two');
});

test('the sweep covers six widths and both themes, and every gallery view, template, pattern and layout has a route', () => {
    assert.deepEqual(WIDTHS, [320, 375, 640, 1024, 1280, 1920]);
    assert.deepEqual(THEMES, ['dark', 'light']);
    const r = routes();
    for (const need of ['#/overview', '#/elements', '#/samples/templates', '#/samples/patterns', '#/samples/layouts']) assert.ok(r.includes(need), need);
    assert.equal(new Set(r).size, r.length, 'no route twice');
    assert.ok(r.some(x => x.startsWith('#/elements/pk-')));
});
