// Tests for the tree logic. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import { flattenTree, treeKey, typeahead, ariaPositions } from './tree.js';
import tree from './tree.js';

const data = [
    { id: 'a', label: 'Products', expanded: true, children: [{ id: 'a1', label: 'Books' }, { id: 'a2', label: 'Cards', expanded: false, children: [{ id: 'a21', label: 'Puzzles' }] }] },
    { id: 'b', label: 'Orders' },
];

test('flattenTree lists only visible nodes with level, parent and expandable', () => {
    const t = flattenTree(data);
    assert.deepEqual(t.map(n => n.id), ['a', 'a1', 'a2', 'b']);
    assert.deepEqual(t.map(n => n.level), [1, 2, 2, 1]);
    assert.deepEqual(t.map(n => n.parent), [-1, 0, 0, -1]);
    assert.equal(t[2].expandable, true);
    assert.equal(t[1].expandable, false);
});

test('arrows move focus and stop at the ends', () => {
    const t = flattenTree(data);
    assert.deepEqual(treeKey(t, 0, 'ArrowDown'), { action: 'focus', index: 1 });
    assert.equal(treeKey(t, 3, 'ArrowDown'), null);
    assert.equal(treeKey(t, 0, 'ArrowUp'), null);
    assert.deepEqual(treeKey(t, 1, 'Home'), { action: 'focus', index: 0 });
    assert.deepEqual(treeKey(t, 1, 'End'), { action: 'focus', index: 3 });
});

test('right expands a closed branch, then enters it; left collapses, then goes to the parent', () => {
    const t = flattenTree(data);
    assert.deepEqual(treeKey(t, 2, 'ArrowRight'), { action: 'expand', index: 2 });
    assert.deepEqual(treeKey(t, 0, 'ArrowRight'), { action: 'focus', index: 1 });
    assert.equal(treeKey(t, 1, 'ArrowRight'), null);
    assert.deepEqual(treeKey(t, 0, 'ArrowLeft'), { action: 'collapse', index: 0 });
    assert.deepEqual(treeKey(t, 1, 'ArrowLeft'), { action: 'focus', index: 0 });
    assert.equal(treeKey(t, 3, 'ArrowLeft'), null);
});

test('Enter and Space select; other keys are ignored; an unknown index focuses the first node', () => {
    const t = flattenTree(data);
    assert.deepEqual(treeKey(t, 1, 'Enter'), { action: 'select', index: 1 });
    assert.deepEqual(treeKey(t, 1, ' '), { action: 'select', index: 1 });
    assert.equal(treeKey(t, 1, 'x'), null);
    assert.deepEqual(treeKey(t, -1, 'ArrowDown'), { action: 'focus', index: 0 });
    assert.equal(treeKey([], 0, 'ArrowDown'), null);
});

test('typeahead finds the next label that starts with the text, wrapping', () => {
    const t = flattenTree(data);
    assert.equal(typeahead(t, 0, 'ca'), 2);
    assert.equal(typeahead(t, 3, 'pro'), 0);
    assert.equal(typeahead(t, 0, 'zz'), -1);
    assert.equal(typeahead(t, 0, ''), -1);
});

test('ariaPositions reports level, set size and position among siblings', () => {
    const p = ariaPositions(flattenTree(data));
    assert.deepEqual(p[1], { level: 2, setsize: 2, posinset: 1 });
    assert.deepEqual(p[2], { level: 2, setsize: 2, posinset: 2 });
    assert.deepEqual(p[3], { level: 1, setsize: 2, posinset: 2 });
});

// Issue #21: connecting with items that are already in the document but not upgraded yet must not throw (no aria() on them).
test('updated waits for un-upgraded items instead of calling aria() on them', async () => {
    let waited = null; let updates = 0; const calls = [];
    globalThis.customElements = { whenDefined: name => { waited = name; return Promise.resolve(); } };
    const Tree = tree(class {});
    const raw = {}; // a pk-tree-item that has not been defined yet: a plain element without aria()
    const host = { label: '', selection: 'single', value: '', aria: m => calls.push(m), querySelectorAll: () => [raw], requestUpdate: () => { updates++; } };
    assert.doesNotThrow(() => Tree.prototype.updated.call(host));
    assert.deepEqual(calls, [{ role: 'tree', ariaLabel: null }]);
    assert.equal(waited, 'pk-tree-item');
    await Promise.resolve();
    assert.equal(updates, 1);
});

test('updated still sets the item roles once every item is upgraded', () => {
    const seen = []; const item = { tabIndex: 0, selected: false, aria: m => seen.push(m) };
    const Tree = tree(class {});
    const host = { label: 'Files', selection: 'single', value: '', aria() {}, querySelectorAll: () => [item], nodes: [{ el: item, level: 1, parent: -1, expandable: false, expanded: false }], requestUpdate() {} };
    Tree.prototype.updated.call(host);
    assert.deepEqual(seen, [{ role: 'treeitem', ariaLevel: '1', ariaSetSize: '1', ariaPosInSet: '1', ariaExpanded: null, ariaSelected: 'false' }]);
});
