// The shared keyboard-reorder logic (js/tree-reorder.js): a generic tree, independent of any element or document model.
import './needs-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { moveTarget, MOVE_KEYS } from '../js/tree-reorder.js';

// A tiny tree of plain objects { id, kids }, so the test does not depend on any real document shape.
//   root: [a, b [b1, b2], c]
function tree() {
    const a = { id: 'a' }, b1 = { id: 'b1' }, b2 = { id: 'b2' }, b = { id: 'b', kids: [b1, b2] }, c = { id: 'c' };
    const all = { a, b, b1, b2, c };
    const parentOf = { a: null, b: null, c: null, b1: 'b', b2: 'b' };
    const kidsOf = id => (all[id]?.kids ?? []).map(k => k.id);
    return { all, locate(id) {
        const p = parentOf[id];
        const siblings = (p ? kidsOf(p) : ['a', 'b', 'c']).map(sid => all[sid]);
        return { parentId: p, siblings, index: siblings.findIndex(s => s.id === id) };
    } };
}

test('MOVE_KEYS maps the four keys to their direction', () => {
    assert.deepEqual(MOVE_KEYS, { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'out', ArrowRight: 'in' });
});

test('up/down move within the same siblings, and stop at the ends', () => {
    const { locate } = tree();
    assert.deepEqual(moveTarget('b', 'up', locate), { id: 'b', parentId: null, index: 0 });
    assert.equal(moveTarget('a', 'up', locate), null);
    assert.deepEqual(moveTarget('a', 'down', locate), { id: 'a', parentId: null, index: 1 });
    assert.equal(moveTarget('c', 'down', locate), null);
});

test('out promotes a node to its parent\'s own level, right after the former parent', () => {
    const { locate } = tree();
    assert.deepEqual(moveTarget('b1', 'out', locate), { id: 'b1', parentId: null, index: 2 });
    assert.equal(moveTarget('a', 'out', locate), null); // already at the root
});

test('in adopts into the nearest preceding sibling that can take a child', () => {
    const { locate } = tree();
    assert.deepEqual(moveTarget('c', 'in', locate), { id: 'c', parentId: 'b', index: undefined });
    assert.equal(moveTarget('a', 'in', locate), null); // nothing before it
});

test('in skips a preceding sibling the caller marks as unable to adopt, and keeps looking further back', () => {
    const { locate } = tree();
    const adopterId = entry => (entry.id === 'b' ? null : entry.id); // pretend b cannot take children
    assert.deepEqual(moveTarget('c', 'in', locate, adopterId), { id: 'c', parentId: 'a', index: undefined });
    const noneAdopt = () => null;
    assert.equal(moveTarget('c', 'in', locate, noneAdopt), null);
});

test('an id outside the tree has nowhere to go', () => {
    const { locate } = tree();
    assert.equal(moveTarget('missing', 'up', locate), null);
});
