// Unit tests for pk-tabs: selection sync, ARIA wiring, choosing a tab and arrow-key navigation. Stub base, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './tabs.js';

const tab = (value, props = {}) => ({ localName: 'pk-tab', value, disabled: false, offsetParent: {}, selected: false, tabIndex: -1, id: '', attrs: {}, focused: 0,
    setAttribute(n, v) { this.attrs[n] = v; }, focus() { this.focused++; }, scrollIntoView() { this.scrolled = true; }, closest() { return this; }, ...props });
const panel = value => ({ localName: 'pk-tab-panel', value, selected: false, tabIndex: -1, id: '', attrs: {}, setAttribute(n, v) { this.attrs[n] = v; } });

const make = (props = {}, tabs = [], panels = []) => {
    const emitted = []; const warned = []; const listAttrs = {}; const listeners = {};
    const list = { scrollWidth: 300, clientWidth: 100, scrollLeft: 0, setAttribute: (n, v) => { listAttrs[n] = v; }, removeAttribute: n => { delete listAttrs[n]; }, addEventListener(t, fn) { listeners[t] = fn; } };
    const el = new (behaviour(class {
        slotted(name) { return name === 'tab' ? tabs : panels; }
        part() { return list; }
        watchSlot() {}
        emit(n, d) { emitted.push([n, d]); return el.allow !== false; }
        warnOnce(k) { warned.push(k); }
    }))();
    Object.assign(el, { value: '', noneActive: false, scroll: false, activation: 'auto' }, props);
    return { el, emitted, warned, list, listAttrs, listeners };
};
const key = (k, target) => { const e = { key: k, target, prevented: false, preventDefault() { this.prevented = true; } }; return e; };

test('sync selects the tab and panel that match value and makes only the selected one a tab stop', () => {
    const [a, b] = [tab('a'), tab('b')]; const [pa, pb] = [panel('a'), panel('b')];
    const { el } = make({ value: 'b' }, [a, b], [pa, pb]);
    el.sync();
    assert.deepEqual([a.selected, b.selected], [false, true]); assert.deepEqual([a.tabIndex, b.tabIndex], [-1, 0]);
    assert.deepEqual([pa.selected, pb.selected], [false, true]); assert.deepEqual([pa.tabIndex, pb.tabIndex], [-1, 0]);
});

test('sync pairs each tab with its panel through aria-controls and aria-labelledby, with fresh ids', () => {
    const [a, b] = [tab('a'), tab('b', { id: 'mine' })]; const [pa, pb] = [panel('a'), panel('b')];
    const { el } = make({ value: 'a' }, [a, b], [pa, pb]);
    el.sync();
    assert.match(a.id, /^pk-tab-\d+$/); assert.equal(b.id, 'mine');
    assert.equal(a.attrs['aria-controls'], pa.id); assert.equal(pa.attrs['aria-labelledby'], a.id);
    assert.equal(b.attrs['aria-controls'], pb.id); assert.notEqual(pa.id, pb.id);
});

test('an unknown value warns once and falls back to the first enabled tab, announcing the fallback', () => {
    const [a, b] = [tab('a', { disabled: true }), tab('b')];
    const { el, emitted, warned } = make({ value: 'zzz' }, [a, b]);
    el.sync();
    assert.equal(el.value, 'b'); assert.equal(b.selected, true);
    assert.deepEqual(warned, ['value:zzz']);
    assert.deepEqual(emitted, [['pk-tab-change', { value: 'b', previous: 'zzz', fallback: true }]]);
});

test('an empty value falls back silently to the first tab without a warning', () => {
    const { el, warned } = make({ value: '' }, [tab('a'), tab('b')]);
    el.sync();
    assert.equal(el.value, 'a'); assert.deepEqual(warned, []);
});

test('a disabled selected tab is replaced by the first enabled one', () => {
    const { el } = make({ value: 'a' }, [tab('a', { disabled: true }), tab('b')]);
    el.sync();
    assert.equal(el.value, 'b');
});

test('none-active leaves everything unselected and every tab reachable', () => {
    const [a, b] = [tab('a'), tab('b')]; const pa = panel('a');
    const { el, emitted } = make({ value: 'a', noneActive: true }, [a, b], [pa]);
    el.sync();
    assert.deepEqual([a.selected, b.selected, pa.selected], [false, false, false]);
    assert.deepEqual([a.tabIndex, b.tabIndex], [0, 0]); assert.deepEqual(emitted, []);
});

test('with no tabs sync does nothing; non-tab children are ignored by the getters', () => {
    const { el } = make({ value: 'x' }, [], []);
    assert.doesNotThrow(() => el.sync());
    const stray = { localName: 'div' };
    const t = make({}, [stray, tab('a')], [stray, panel('a')]);
    assert.equal(t.el.tabs.length, 1); assert.equal(t.el.panels.length, 1);
});

test('choose changes the value and announces pk-tab-change with the previous one, then focuses when asked', () => {
    const [a, b] = [tab('a'), tab('b')];
    const { el, emitted } = make({ value: 'a' }, [a, b]);
    el.choose(b, true);
    assert.equal(el.value, 'b'); assert.equal(b.focused, 1);
    assert.deepEqual(emitted, [['pk-tab-change', { value: 'b', previous: 'a' }]]);
});

test('a cancelled change restores the value and does not focus', () => {
    const [a, b] = [tab('a'), tab('b')];
    const { el } = make({ value: 'a' }, [a, b]);
    el.allow = false;
    el.choose(b, true);
    assert.equal(el.value, 'a'); assert.equal(b.focused, 0);
});

test('choosing the current or a disabled tab announces nothing (focus still moves when asked)', () => {
    const [a, d] = [tab('a'), tab('d', { disabled: true })];
    const { el, emitted } = make({ value: 'a' }, [a, d]);
    el.choose(a, true); el.choose(d, true);
    assert.deepEqual(emitted, []); assert.equal(a.focused, 1); assert.equal(d.focused, 1);
});

test('with none-active choosing announces without storing a value', () => {
    const [a, b] = [tab('a'), tab('b')];
    const { el, emitted } = make({ value: '', noneActive: true }, [a, b]);
    el.choose(b);
    assert.equal(el.value, ''); assert.equal(emitted.length, 1);
});

test('arrow keys move through the visible enabled tabs with wrap-around, Home and End jump, and the key is consumed', () => {
    const [a, hidden, off, b, c] = [tab('a'), tab('h', { offsetParent: null }), tab('o', { disabled: true }), tab('b'), tab('c')];
    const { el } = make({ value: 'a' }, [a, hidden, off, b, c]);
    let e = key('ArrowRight', a); el.key(e);
    assert.equal(el.value, 'b'); assert.equal(e.prevented, true); assert.equal(b.focused, 1);
    el.key(key('End', b)); assert.equal(el.value, 'c');
    el.key(key('ArrowRight', c)); assert.equal(el.value, 'a');
    el.key(key('ArrowLeft', a)); assert.equal(el.value, 'c');
    el.key(key('Home', c)); assert.equal(el.value, 'a');
});

test('manual activation moves focus and the tab stop without choosing', () => {
    const [a, b] = [tab('a', { tabIndex: 0 }), tab('b')];
    const { el, emitted } = make({ value: 'a', activation: 'manual' }, [a, b]);
    el.key(key('ArrowRight', a));
    assert.equal(el.value, 'a'); assert.equal(b.focused, 1); assert.deepEqual([a.tabIndex, b.tabIndex], [-1, 0]); assert.deepEqual(emitted, []);
});

test('other keys and keys from outside a tab are left alone', () => {
    const a = tab('a');
    const { el } = make({ value: 'a' }, [a]);
    const e1 = key('x', a); el.key(e1); assert.equal(e1.prevented, false);
    const e2 = key('ArrowRight', { closest: () => null }); el.key(e2); assert.equal(e2.prevented, false);
});

test('the scroll fade marks the side that still has tabs beyond it, and clears when not scrolling', () => {
    const m = make({ scroll: true }, [tab('a')]);
    m.el.fade(); assert.equal(m.listAttrs['data-fade'], 'end');
    m.list.scrollLeft = 50; m.el.fade(); assert.equal(m.listAttrs['data-fade'], 'both');
    m.list.scrollLeft = 200; m.el.fade(); assert.equal(m.listAttrs['data-fade'], 'start');
    m.list.scrollWidth = 100; m.el.fade(); assert.equal('data-fade' in m.listAttrs, false);
    m.list.scrollWidth = 300; m.el.scroll = false; m.el.fade(); assert.equal('data-fade' in m.listAttrs, false);
});

test('a click on a tab in the strip chooses it; changed() re-syncs for value and none-active only', () => {
    const [a, b] = [tab('a'), tab('b')];
    const { el, listeners } = make({ value: 'a' }, [a, b]);
    globalThis.ResizeObserver = undefined;
    el.connected();
    listeners.click({ target: { closest: () => b } });
    assert.equal(el.value, 'b');
    let syncs = 0; el.sync = () => { syncs++; };
    el.changed('value'); el.changed('noneActive'); el.changed('activation');
    assert.equal(syncs, 2);
});
