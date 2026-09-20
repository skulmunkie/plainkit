// Unit tests for the side nav's filter, tree keys and persisted state. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import { filterNav, splitMatch, treeKey, serializeNav, parseNav, navMode, railRowTooltip } from './side-nav.js';

const entries = [
    { id: 'sell', label: 'Sell', parent: null },
    { id: 'orders', label: 'Orders', parent: 'sell' },
    { id: 'products', label: 'Products', parent: null },
    { id: 'all', label: 'All products', parent: 'products' },
    { id: 'drafts', label: 'Drafts', parent: 'products' },
];

test('an empty query shows everything and opens nothing', () => {
    const r = filterNav(entries, '  ');
    assert.equal(r.visible.size, 5);
    assert.equal(r.open.size, 0);
});

test('a match keeps its branch visible and opens it', () => {
    const r = filterNav(entries, 'draft');
    assert.deepEqual([...r.matches], ['drafts']);
    assert.deepEqual([...r.visible].sort(), ['drafts', 'products']);
    assert.deepEqual([...r.open], ['products']);
});

test('matching is case-insensitive and a branch name matches on its own', () => {
    const r = filterNav(entries, 'SELL');
    assert.deepEqual([...r.visible], ['sell']);
    assert.equal(r.open.size, 0);
    assert.equal(filterNav(entries, 'zzz').visible.size, 0);
});

test('the matched text of a label is split for highlighting', () => {
    assert.deepEqual(splitMatch('All products', 'prod'), [{ text: 'All ', match: false }, { text: 'prod', match: true }, { text: 'ucts', match: false }]);
    assert.deepEqual(splitMatch('Orders', ''), [{ text: 'Orders', match: false }]);
    assert.deepEqual(splitMatch('Orders', 'x'), [{ text: 'Orders', match: false }]);
});

test('arrow keys walk the tree: Right opens then enters, Left folds then goes up', () => {
    assert.equal(treeKey('ArrowDown'), 'next');
    assert.equal(treeKey('ArrowUp'), 'prev');
    assert.equal(treeKey('Home'), 'first');
    assert.equal(treeKey('End'), 'last');
    assert.equal(treeKey('ArrowRight', { hasChildren: true, expanded: false }), 'expand');
    assert.equal(treeKey('ArrowRight', { hasChildren: true, expanded: true }), 'focus-child');
    assert.equal(treeKey('ArrowRight', { hasChildren: false }), null);
    assert.equal(treeKey('ArrowLeft', { hasChildren: true, expanded: true }), 'collapse');
    assert.equal(treeKey('ArrowLeft', { isChild: true }), 'focus-parent');
    assert.equal(treeKey('ArrowLeft', {}), null);
    assert.equal(treeKey('x'), null);
});

test('persisted state round-trips and survives garbage', () => {
    const text = serializeNav(new Set(['products', 'sell']), true);
    assert.deepEqual(parseNav(text), { open: ['products', 'sell'], collapsed: true });
    assert.deepEqual(parseNav('not json'), { open: [], collapsed: false });
    assert.deepEqual(parseNav('{"o":[1,"a"],"c":"yes"}'), { open: ['a'], collapsed: false });
    assert.deepEqual(parseNav(null), { open: [], collapsed: false });
});

test('the nav is a drawer on a phone or tablet, a rail when collapsed, otherwise full', () => {
    assert.equal(navMode(800, true), 'drawer');
    assert.equal(navMode(1280, true), 'rail');
    assert.equal(navMode(1280, false), 'full');
    assert.equal(railRowTooltip('  Orders '), 'Orders');
    assert.equal(railRowTooltip(undefined), '');
});

