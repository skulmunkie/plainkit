import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import behaviour, { parseSize, formatBytes, acceptsFile, validateFiles } from './dropzone.js';

const file = (name, size = 100, type = '') => ({ name, size, type });
test('parseSize reads units case-insensitively and refuses junk', () => {
    assert.equal(parseSize('5MB'), 5 * 1024 * 1024);
    assert.equal(parseSize('500 kb'), 512000);
    assert.equal(parseSize('1.5GB'), Math.round(1.5 * 1024 ** 3));
    assert.equal(parseSize('2048'), 2048);
    assert.equal(parseSize('big'), null);
    assert.equal(parseSize(null), null);
});
test('formatBytes picks a readable unit', () => {
    assert.equal(formatBytes(512), '512 B');
    assert.equal(formatBytes(1536), '1.5 KB');
    assert.equal(formatBytes(20 * 1024 * 1024), '20 MB');
});
test('acceptsFile matches extensions, exact types and type wildcards; an empty list accepts anything', () => {
    assert.equal(acceptsFile(file('Feed.CSV'), '.csv'), true);
    assert.equal(acceptsFile(file('a.txt', 1, 'text/csv'), '.csv,text/csv'), true);
    assert.equal(acceptsFile(file('a.png', 1, 'image/png'), 'image/*'), true);
    assert.equal(acceptsFile(file('a.pdf', 1, 'application/pdf'), 'image/*,.csv'), false);
    assert.equal(acceptsFile(file('anything'), ''), true);
});
test('validateFiles applies type, size and count rules and explains each rejection', () => {
    const { accepted, rejected } = validateFiles([file('a.csv'), file('b.exe'), file('c.csv', 9999), file('d.csv'), file('e.csv')], { accept: '.csv', maxSize: 1000, maxFiles: 2 });
    assert.deepEqual(accepted.map(f => f.name), ['a.csv', 'd.csv']);
    assert.deepEqual(rejected.map(r => r.file.name), ['b.exe', 'c.csv', 'e.csv']);
    assert.match(rejected[0].reason, /type/);
    assert.match(rejected[1].reason, /Larger than/);
    assert.match(rejected[2].reason, /Only 2 files/);
});

// A stand-in for PkElement: the input slot is a list, part() names the control, and a click is recorded.
const make = (props = {}, slotted = []) => {
    const clicks = []; const control = { click() { clicks.push('control'); } };
    const el = new (behaviour(class { slotted() { return slotted; } part(n) { return n === 'control' ? control : null; } }))();
    Object.assign(el, { disabled: false }, props);
    return { el, clicks };
};
test('pick() clicks the file input, does nothing while disabled, and prefers the input in the input slot', () => {
    const own = make(); own.el.pick(); assert.deepEqual(own.clicks, ['control']);
    const off = make({ disabled: true }); off.el.pick(); assert.deepEqual(off.clicks, []);
    const hit = []; const ext = { localName: 'input', click() { hit.push('slot'); } };
    const slot = make({}, [ext]); slot.el.pick(); assert.deepEqual(hit, ['slot']); assert.deepEqual(slot.clicks, []);
    const wrapped = make({}, [{ localName: 'span', querySelector: () => ext }]); wrapped.el.pick(); assert.deepEqual(hit, ['slot', 'slot']);
});

test('the meta documents pick(), the browse-label prop and its part, and the template draws the button only for a label', () => {
    const read = ext => fs.readFileSync(fileURLToPath(new URL(`./dropzone.${ext}`, import.meta.url)), 'utf8');
    const meta = JSON.parse(read('meta.json'));
    assert.ok(meta.methods.some(m => m.name === 'pick()'));
    assert.equal(meta.props.find(p => p.name === 'browseLabel').default, '');
    assert.ok(meta.parts.some(p => p.name === 'browse'));
    assert.ok(meta.examples.some(e => e.html.includes('browse-label')));
    assert.match(read('html'), /<button part="browse"[^>]*data-if="browseLabel"/);
    assert.match(read('css'), /@media \(pointer: coarse\)[^{]*\{ \.browse \{ min-block-size: var\(--touch-target\)/);
});
