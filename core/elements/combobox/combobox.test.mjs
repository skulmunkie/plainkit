import test from 'node:test';
import assert from 'node:assert/strict';
import { filterOptions } from './combobox.js';

test('filterOptions is a case-insensitive contains and an empty query matches everything', () => {
    assert.deepEqual(filterOptions(['Alpha', 'Beta', 'Ruby'], 'A'), [true, true, false]);
    assert.deepEqual(filterOptions(['a', 'b'], '  '), [true, true]);
    assert.deepEqual(filterOptions(['a'], 'zz'), [false]);
});
// Performance guard (audit #106): the option build ran a shadow-root query per option, which made 5,000 options take seconds (quadratic). The
// nodes it needs are looked up once, before the loop.
test('the option build does not query the shadow root once per option', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL('./combobox.js', import.meta.url), 'utf8');
    const body = source.slice(source.indexOf('.forEach((c, i) => {'), source.indexOf("pop.append(this.part('empty'))"));
    assert.ok(body.length > 50, 'found the option loop');
    assert.doesNotMatch(body, /this\.part\(|querySelector/, 'no lookup inside the per-option loop');
});
