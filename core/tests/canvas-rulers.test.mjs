// Tests for the pure part of the canvas rulers (js/canvas-rulers.js, #430 phase C2): which labelled ticks fall inside a strip, and how a value is written.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ticks, label } from '../js/canvas-rulers.js';

test('label writes at most six significant digits and no trailing zeros', () => {
    assert.equal(label(50), '50');
    assert.equal(label(0.1 + 0.2), '0.3');
    assert.equal(label(-12.5), '-12.5');
});

test('ticks lie inside the strip, one major step apart, and the label is the world value in the unit', () => {
    const t = ticks(100, 400, 1, 1); // zoom 1, origin 100 px along: major step 50
    assert.ok(t.every(x => x.at >= 0 && x.at <= 400));
    assert.deepEqual(t.slice(0, 3), [{ at: 0, text: '-100' }, { at: 50, text: '-50' }, { at: 100, text: '0' }]);
    const mm = ticks(0, 200, 4, 96 / 25.4); // millimetres at zoom 4
    assert.equal(mm[1].text, '5');
    assert.ok(Math.abs(mm[1].at - 5 * (96 / 25.4) * 4) < 1e-9);
});

test('pk-canvas loads the rulers on first use and never imports them statically', () => {
    const src = fs.readFileSync(new URL('../components/canvas/canvas.js', import.meta.url), 'utf8');
    assert.match(src, /import\('\.\.\/\.\.\/js\/canvas-rulers\.js'\)/);
    assert.doesNotMatch(src, /^import .*canvas-rulers/m);
    assert.doesNotMatch(fs.readFileSync(new URL('../js/canvas-rulers.js', import.meta.url), 'utf8'), /from '\.\.\/(components|elements|pages|shells)\//);
});
