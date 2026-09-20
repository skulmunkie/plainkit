// Unit tests for the command palette's matching and grouping. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import { fuzzyMatch, rank, pushRecent, sections, highlight, safeHref, isPaletteShortcut } from './command-palette.js';

const items = [
    { id: 'orders', label: 'Go to Orders', group: 'Navigate' },
    { id: 'products', label: 'Go to Products', group: 'Navigate', keywords: 'catalog inventory' },
    { id: 'new-po', label: 'New purchase order', group: 'Create' },
    { id: 'theme', label: 'Toggle dark theme', group: 'Settings' },
];

test('a subsequence matches and reports the matched positions', () => {
    const m = fuzzyMatch('gto', 'Go to Orders');
    assert.ok(m);
    assert.deepEqual(m.indexes.length, 3);
    assert.equal(fuzzyMatch('xyz', 'Go to Orders'), null);
    assert.equal(fuzzyMatch('sro', 'Go to Orders'), null, 'letters must appear in order');
});

test('an empty query matches everything with no score', () => {
    assert.deepEqual(fuzzyMatch('', 'anything'), { score: 0, indexes: [] });
    assert.deepEqual(fuzzyMatch('  ', 'anything'), { score: 0, indexes: [] });
});

test('word starts, consecutive letters and prefixes beat scattered matches', () => {
    const tight = fuzzyMatch('ord', 'Orders').score;
    const loose = fuzzyMatch('ord', 'Go to red dogs').score;
    assert.ok(tight > loose);
    assert.ok(fuzzyMatch('new', 'New purchase order').score > fuzzyMatch('new', 'Renew wave').score);
});

test('rank filters, orders best first, and keeps original order on ties', () => {
    const r = rank(items, 'go');
    assert.deepEqual(r.map(x => x.item.id), ['orders', 'products']);
    assert.deepEqual(rank(items, '').map(x => x.item.id), items.map(i => i.id));
    assert.deepEqual(rank(items, 'zzz'), []);
});

test('keywords and the group name find an item its label does not', () => {
    assert.deepEqual(rank(items, 'inventory').map(x => x.item.id), ['products']);
    assert.ok(rank(items, 'settings').some(x => x.item.id === 'theme'));
});

test('recents are newest first, unique and capped', () => {
    assert.deepEqual(pushRecent(['a', 'b'], 'c'), ['c', 'a', 'b']);
    assert.deepEqual(pushRecent(['a', 'b'], 'b'), ['b', 'a']);
    assert.equal(pushRecent(['1', '2', '3', '4', '5'], '6').length, 5);
});

test('with no query the sections are recents then groups in first-seen order; with a query one flat list', () => {
    const s = sections(items, '', ['theme', 'gone']);
    assert.deepEqual(s.map(x => x.title), ['Recent', 'Navigate', 'Create', 'Settings']);
    assert.deepEqual(s[0].results.map(r => r.item.id), ['theme']);
    const q = sections(items, 'new', []);
    assert.equal(q.length, 1);
    assert.equal(q[0].title, null);
});

test('highlight splits a label into matched and unmatched runs', () => {
    assert.deepEqual(highlight('Orders', [0, 1]), [{ text: 'Or', match: true }, { text: 'ders', match: false }]);
    assert.deepEqual(highlight('ab', []), [{ text: 'ab', match: false }]);
});

test('only same-site paths and http(s) links are followed', () => {
    assert.equal(safeHref('/orders'), '/orders');
    assert.equal(safeHref('orders.html?x=1'), 'orders.html?x=1');
    assert.equal(safeHref('https://example.com/a'), 'https://example.com/a');
    assert.equal(safeHref('java' + 'script:alert(1)'), null);
    assert.equal(safeHref('data:text/html,x'), null);
    assert.equal(safeHref(''), null);
});

test('Ctrl+K and Cmd+K open it; other modifiers do not', () => {
    assert.equal(isPaletteShortcut({ key: 'k', ctrlKey: true }), true);
    assert.equal(isPaletteShortcut({ key: 'K', metaKey: true }), true);
    assert.equal(isPaletteShortcut({ key: 'k' }), false);
    assert.equal(isPaletteShortcut({ key: 'k', ctrlKey: true, shiftKey: true }), false);
});

