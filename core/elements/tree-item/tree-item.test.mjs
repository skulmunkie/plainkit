// Unit tests for pk-tree-item: expandability, toggle vs select clicks, events and nesting level. Stub base, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './tree-item.js';

const make = (props = {}, children = [], ancestors = 0) => {
    const emitted = []; const vars = {}; const row = { listeners: [], addEventListener(t, fn) { this.listeners.push(fn); } };
    const toggle = { name: 'toggle' }; const kids = { hidden: null };
    const attrs = {}, label = { attrs, addEventListener() {}, setAttribute(k, v) { attrs[k] = v; }, removeAttribute(k) { delete attrs[k]; }, click: () => row.listeners[0]({ composedPath: () => [label], preventDefault() { label.prevented = true; } }) };
    const parts = { row, toggle, label, children: kids };
    // A chain of pk-tree-item ancestors: each one's parentElement.closest finds the next one up.
    let parent = null;
    for (let i = 0; i < ancestors; i++) { const up = parent; parent = { parentElement: up ? { closest: () => up } : null }; }
    const nearest = parent;
    const el = new (behaviour(class {
        part(n) { return parts[n]; }
        slotted() { return children; }
        emit(n, d) { emitted.push([n, d]); return true; }
        watchSlot() {}
        get ownerDocument() { return { defaultView: { location: { assign() {} } } }; }
        get style() { return { setProperty: (k, v) => { vars[k] = v; } }; }
        get parentElement() { return nearest ? { closest: () => nearest } : null; }
    }))();
    Object.assign(el, { value: '', label: 'Books', disabled: false, expanded: false, expandable: false }, props);
    return { el, row, toggle, label, emitted, vars, kids, click: path => row.listeners[0]({ composedPath: () => path }) };
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

test('href makes the label a real link, aria-current when selected; an unsafe href is no link', () => {
    const a = make({ href: '/guides/setup', selected: true }); a.el.warnOnce = () => {}; a.el.updated();
    assert.equal(a.label.attrs.href, '/guides/setup'); assert.equal(a.label.attrs['aria-current'], 'page');
    const b = make({ href: 'ftp://example.com/x' }); b.el.warnOnce = () => {}; b.el.updated();
    assert.equal(b.label.attrs.href, undefined);
});

test('a plain click on a link row selects and reports a cancelable pk-navigate; the row padding clicks the link', () => {
    const { el, row, label, click, emitted } = make({ href: '/a/b', value: 'b' }, []);
    el.warnOnce = () => {}; el.connected(); el.updated();
    click([row]);
    assert.equal(label.prevented, true);
    assert.deepEqual(emitted.map(e => e[0]), ['pk-select', 'pk-navigate']);
    assert.deepEqual(emitted[1][1], { to: '/a/b', href: '/a/b' });
});

test('a modified click on a link row navigates natively', () => {
    const { el, row, label, emitted } = make({ href: '/a/b' }, []);
    el.warnOnce = () => {}; el.connected(); el.updated();
    row.listeners[0]({ composedPath: () => [label], ctrlKey: true, preventDefault() { label.prevented = true; } });
    assert.equal(label.prevented, undefined); assert.deepEqual(emitted.map(e => e[0]), ['pk-select']);
});

test('navigate host raises a non-cancelable pk-navigate and does not assign the location; none leaves the click to the browser; the tree default applies (#1713)', () => {
    const run = (props, treeNavigate) => {
        const { el, row, label, emitted } = make({ href: '/a/b', ...props }, []);
        let assigned = null; Object.defineProperty(el, 'ownerDocument', { get: () => ({ defaultView: { location: { assign: u => { assigned = u; } } } }) });
        el.closest = sel => (sel === 'pk-tree' && treeNavigate ? { navigate: treeNavigate } : null);
        el.warnOnce = () => {}; el.connected(); el.updated();
        let cancelable = null; el.emit = (n, d, o) => { if (n === 'pk-navigate') cancelable = o.cancelable; return true; };
        row.listeners[0]({ composedPath: () => [label], preventDefault() { label.prevented = true; } });
        return { assigned, cancelable, prevented: label.prevented };
    };
    assert.deepEqual(run({}), { assigned: '/a/b', cancelable: true, prevented: true }, 'router (default) assigns when nothing cancels');
    assert.deepEqual(run({ navigate: 'host' }), { assigned: null, cancelable: false, prevented: true });
    assert.deepEqual(run({}, 'host'), { assigned: null, cancelable: false, prevented: true }, 'inherited from the tree');
    assert.deepEqual(run({ navigate: 'router' }, 'host'), { assigned: '/a/b', cancelable: true, prevented: true }, 'the item wins');
    assert.deepEqual(run({ navigate: 'none' }), { assigned: null, cancelable: null, prevented: undefined }, 'none: no event, the browser follows');
});

