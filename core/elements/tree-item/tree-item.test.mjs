// Unit tests for pk-tree-item: expandability, toggle vs select clicks, events and nesting level. Stub base, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './tree-item.js';

const make = (props = {}, children = [], ancestors = 0) => {
    const emitted = []; const vars = {}; const row = { listeners: [], addEventListener(t, fn) { this.listeners.push(fn); } };
    const toggle = { name: 'toggle' }; const kids = { hidden: null };
    const parts = { row, toggle, children: kids };
    // A chain of pk-tree-item ancestors: each one's parentElement.closest finds the next one up.
    let parent = null;
    for (let i = 0; i < ancestors; i++) { const up = parent; parent = { parentElement: up ? { closest: () => up } : null }; }
    const nearest = parent;
    const el = new (behaviour(class {
        part(n) { return parts[n]; }
        slotted() { return children; }
        emit(n, d) { emitted.push([n, d]); return true; }
        watchSlot() {}
        get style() { return { setProperty: (k, v) => { vars[k] = v; } }; }
        get parentElement() { return nearest ? { closest: () => nearest } : null; }
    }))();
    Object.assign(el, { value: '', label: 'Books', disabled: false, expanded: false, expandable: false }, props);
    return { el, row, toggle, emitted, vars, kids, click: path => row.listeners[0]({ composedPath: () => path }) };
};
const child = { localName: 'pk-tree-item' };

test('updated finds out whether it has child items and hides the group unless expanded', () => {
    const leaf = make({}, [{ localName: 'span' }]); leaf.el.updated();
    assert.equal(leaf.el.expandable, false); assert.equal(leaf.kids.hidden, true);
    const closed = make({}, [child]); closed.el.updated();
    assert.equal(closed.el.expandable, true); assert.equal(closed.kids.hidden, true);
    const open = make({ expanded: true }, [child]); open.el.updated();
    assert.equal(open.kids.hidden, false);
    const stale = make({ expanded: true }, []); stale.el.updated();
    assert.equal(stale.kids.hidden, true);
});

test('the nesting level counts tree-item ancestors starting at 1', () => {
    const top = make({}, [], 0); top.el.updated(); assert.equal(top.vars['--pk-tree-item-level'], '1');
    const deep = make({}, [], 1); deep.el.updated(); assert.equal(deep.vars['--pk-tree-item-level'], '2');
});

test('clicking the toggle of an expandable item expands it and announces pk-toggle with the id', () => {
    const { el, toggle, click, emitted } = make({ value: 'b1' }, [child]);
    el.connected(); el.updated();
    click([toggle]);
    assert.equal(el.expanded, true);
    assert.deepEqual(emitted, [['pk-toggle', { id: 'b1', expanded: true }]]);
    click([toggle]);
    assert.deepEqual(emitted.at(-1), ['pk-toggle', { id: 'b1', expanded: false }]);
});

test('clicking the row selects, using the label when there is no value', () => {
    const { el, row, click, emitted } = make({}, [child]);
    el.connected(); el.updated();
    click([row]);
    assert.deepEqual(emitted, [['pk-select', { id: 'Books' }]]);
});

test('the toggle of a leaf selects instead of expanding', () => {
    const { el, toggle, click, emitted } = make({}, []);
    el.connected(); el.updated();
    click([toggle]);
    assert.equal(el.expanded, false); assert.deepEqual(emitted, [['pk-select', { id: 'Books' }]]);
});

test('a disabled item does nothing on click or select', () => {
    const { el, row, toggle, click, emitted } = make({ disabled: true }, [child]);
    el.connected(); el.updated();
    click([row]); click([toggle]); el.select();
    assert.equal(el.expanded, false);
    assert.deepEqual(emitted, []);
});

test('setExpanded ignores the current value, and non-expandable items', () => {
    const a = make({ expandable: true, expanded: true }); a.el.setExpanded(true);
    assert.deepEqual(a.emitted, []);
    const b = make({ expandable: false }); b.el.setExpanded(true);
    assert.equal(b.el.expanded, false); assert.deepEqual(b.emitted, []);
});

test('connecting twice adds one row listener', () => {
    const { el, row } = make();
    el.connected(); el.connected();
    assert.equal(row.listeners.length, 1);
});
