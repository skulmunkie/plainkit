// Tests for the progress logic. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import { percent, segments, levelFor } from './progress.js';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

test('percent rounds, clamps and survives a zero max', () => {
    assert.equal(percent(30, 120), 25);
    assert.equal(percent(150, 100), 100);
    assert.equal(percent(-5, 100), 0);
    assert.equal(percent(5, 0), 0);
});

test('segments are proportional, contiguous and add up to the total', () => {
    const s = segments([50, 30, 20]);
    assert.deepEqual(s, [{ start: 0, width: 50 }, { start: 50, width: 30 }, { start: 80, width: 20 }]);
    const odd = segments([1, 1, 1]);
    assert.equal(odd.reduce((a, x) => a + x.width, 0), 100);
    assert.equal(odd[2].start + odd[2].width, 100);
});

test('segments of nothing are zero width', () => {
    assert.deepEqual(segments([0, 0]), [{ start: 0, width: 0 }, { start: 0, width: 0 }]);
    assert.deepEqual(segments([]), []);
});

test('levelFor steps from ok to warn to danger at the thresholds', () => {
    assert.equal(levelFor(50), 'ok');
    assert.equal(levelFor(70), 'warn');
    assert.equal(levelFor(90), 'danger');
    assert.equal(levelFor(80, 50, 80), 'danger');
});
const read = ext => fs.readFileSync(fileURLToPath(new URL(`./progress.${ext}`, import.meta.url)), 'utf8');
const meta = JSON.parse(read('meta.json'));
const prop = name => meta.props.find(p => p.name === name);

test('inline puts the label, the bar and the value on one line', () => {
    assert.equal(prop('inline').type, 'boolean'); assert.equal(prop('inline').default, false);
    const css = read('css');
    assert.ok(css.includes(':host([inline]) [part="row"] { display: contents; }'));
    for (const part of ['label', 'bar', 'value']) assert.ok(new RegExp(`:host\\(\\[inline\\]\\) \\[part="${part}"\\] \\{ grid-area`).test(css), part);
    assert.ok(!/#[0-9a-f]{3,8}\b|\brgba?\(/i.test(css));
});
