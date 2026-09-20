import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSize, formatBytes, acceptsFile, validateFiles } from './dropzone.js';

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
