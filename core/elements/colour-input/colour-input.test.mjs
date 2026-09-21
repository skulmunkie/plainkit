import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHex } from './colour-input.js';

test('normalizeHex accepts 3 and 6 digit hex with or without # and refuses anything else', () => {
    assert.equal(normalizeHex('#ABC'), '#aabbcc');
    assert.equal(normalizeHex('4a90e2'), '#4a90e2');
    assert.equal(normalizeHex(' #4A90E2 '), '#4a90e2');
    assert.equal(normalizeHex('#12'), null);
    assert.equal(normalizeHex('#gggggg'), null);
    assert.equal(normalizeHex(''), null);
});

// Issue #8: the visible label mode of pk-input (showLabel, the label part, a label linked to the control).
test('showLabel renders a label element linked to the control, off by default', async () => {
    const fs = await import('node:fs'); const { fileURLToPath } = await import('node:url');
    const read = ext => fs.readFileSync(fileURLToPath(new URL('./colour-input.' + ext, import.meta.url)), 'utf8');
    const meta = JSON.parse(read('meta.json')); const p = meta.props.find(x => x.name === 'showLabel');
    assert.equal(p.type, 'boolean'); assert.equal(p.default, false); assert.equal(p.reflect, true);
    assert.match(read('html'), /<label part="label" for="c">\{\{label\}\}<\/label>/);
    assert.match(read('html'), /part="control" (class="hex" )?id="c"|id="c" class="hex"/);
    assert.ok(meta.parts.some(x => x.name === 'label'));
    assert.ok(read('css').includes('label { display: none;'));
    assert.ok(read('css').includes(':host([show-label]) label { display: block; }'));
});
