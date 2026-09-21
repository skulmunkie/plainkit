import test from 'node:test';
import assert from 'node:assert/strict';
import { flagsOf, autogrowHeight } from './textarea.js';

test('autogrowHeight adds the borders and honours the cap', () => {
    assert.equal(autogrowHeight(100, 2), 102);
    assert.equal(autogrowHeight(500, 2, 240), 240);
    assert.equal(autogrowHeight(100, 2, 240), 102);
});
test('flagsOf copies every ValidityState-like flag', () => {
    const f = flagsOf({ valueMissing: true, tooLong: false });
    assert.equal(f.valueMissing, true);
    assert.equal(f.tooLong, false);
});

// Issue #8: the visible label mode of pk-input (showLabel, the label part, a label linked to the control).
test('showLabel renders a label element linked to the control, off by default', async () => {
    const fs = await import('node:fs'); const { fileURLToPath } = await import('node:url');
    const read = ext => fs.readFileSync(fileURLToPath(new URL('./textarea.' + ext, import.meta.url)), 'utf8');
    const meta = JSON.parse(read('meta.json')); const p = meta.props.find(x => x.name === 'showLabel');
    assert.equal(p.type, 'boolean'); assert.equal(p.default, false); assert.equal(p.reflect, true);
    assert.match(read('html'), /<label part="label" for="c">\{\{label\}\}<\/label>/);
    assert.match(read('html'), /part="control" (class="hex" )?id="c"|id="c" class="hex"/);
    assert.ok(meta.parts.some(x => x.name === 'label'));
    assert.ok(read('css').includes('label { display: none;'));
    assert.ok(read('css').includes(':host([show-label]) label { display: block; }'));
});
