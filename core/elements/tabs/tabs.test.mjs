// Unit tests for pk-tabs: selection sync, ARIA wiring, choosing a tab and arrow-key navigation. Stub base, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour, { hiddenTabs } from './tabs.js';

const tab = (value, props = {}) => ({ localName: 'pk-tab', value, disabled: false, offsetParent: {}, selected: false, tabIndex: -1, id: '', attrs: {}, focused: 0, textContent: value, overflowHidden: false,
    setAttribute(n, v) { this.attrs[n] = v; }, focus() { this.focused++; }, scrollIntoView() { this.scrolled = true; }, closest() { return this; },
    getBoundingClientRect() { return { width: this.width ?? 40 }; },
    toggleAttribute(n, on) { if (n === 'data-overflow-hidden') this.overflowHidden = Boolean(on); }, removeAttribute(n) { if (n === 'data-overflow-hidden') this.overflowHidden = false; }, ...props });
const panel = value => ({ localName: 'pk-tab-panel', value, selected: false, tabIndex: -1, id: '', attrs: {}, setAttribute(n, v) { this.attrs[n] = v; } });

const make = (props = {}, tabs = [], panels = []) => {
    const emitted = []; const warned = []; const listAttrs = {}; const listeners = {};
    const list = { scrollWidth: 300, clientWidth: 100, scrollLeft: 0, setAttribute: (n, v) => { listAttrs[n] = v; }, removeAttribute: n => { delete listAttrs[n]; }, addEventListener(t, fn) { listeners[t] = fn; } };
    const more = { hidden: true, children: [], attrs: {}, getBoundingClientRect() { return { width: this.width ?? 30 }; }, setAttribute(n, v) { this.attrs[n] = v; }, appendChild(c) { this.children.push(c); } };
    const moreTrigger = { attrs: {}, setAttribute(n, v) { this.attrs[n] = v; } };
    const parts = { list, more, 'more-trigger': moreTrigger };
    const hostListeners = {};
    const el = new (behaviour(class {
        slotted(name) { return name === 'tab' ? tabs : panels; }
        part(name) { return parts[name] ?? list; }
        watchSlot() {}
        addEventListener(t, fn) { hostListeners[t] = fn; }
        emit(n, d) { emitted.push([n, d]); return el.allow !== false; }
        warnOnce(k) { warned.push(k); }
    }))();
    Object.assign(el, { value: '', noneActive: false, overflow: 'scroll', activation: 'auto' }, props);
    return { el, emitted, warned, list, more, moreTrigger, listAttrs, listeners, hostListeners };
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

test('in a right-to-left layout ArrowLeft moves to the next tab and ArrowRight to the previous one, in reading order; Home/End are unaffected', () => {
    const [a, b, c] = [tab('a'), tab('b'), tab('c')];
    const { el } = make({ value: 'a' }, [a, b, c]);
    const saved = globalThis.getComputedStyle;
    globalThis.getComputedStyle = () => ({ direction: 'rtl' });
    try {
        el.key(key('ArrowLeft', a)); assert.equal(el.value, 'b');
        el.key(key('ArrowLeft', b)); assert.equal(el.value, 'c');
        el.key(key('ArrowRight', c)); assert.equal(el.value, 'b');
        el.key(key('End', b)); assert.equal(el.value, 'c');
        el.key(key('Home', c)); assert.equal(el.value, 'a');
    } finally { globalThis.getComputedStyle = saved; }
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
    const m = make({ overflow: 'scroll' }, [tab('a')]);
    m.el.fade(); assert.equal(m.listAttrs['data-fade'], 'end');
    m.list.scrollLeft = 50; m.el.fade(); assert.equal(m.listAttrs['data-fade'], 'both');
    m.list.scrollLeft = 200; m.el.fade(); assert.equal(m.listAttrs['data-fade'], 'start');
    m.list.scrollWidth = 100; m.el.fade(); assert.equal('data-fade' in m.listAttrs, false);
    m.list.scrollWidth = 300; m.el.overflow = 'wrap'; m.el.fade(); assert.equal('data-fade' in m.listAttrs, false);
});

// overflow="menu": which tabs collapse behind the "..." button. Pure, mirrors breadcrumb.test.mjs's coverage of hiddenCrumbs.
test('hiddenTabs: a strip that fits keeps every tab', () => {
    assert.deepEqual(hiddenTabs([40, 40, 40], 200, 30), []);
    assert.deepEqual(hiddenTabs([], 200, 30), []);
});

test('hiddenTabs: a strip that does not fit hides tabs from the end until the rest, plus the trigger, fits', () => {
    assert.deepEqual(hiddenTabs([40, 40, 40, 40, 40], 120, 30), [2, 3, 4]);
});

test('hiddenTabs: the active tab is pinned and never hidden, however far along the strip it sits', () => {
    assert.deepEqual(hiddenTabs([40, 40, 40, 40, 40], 120, 30, 4), [1, 2, 3]);
    assert.deepEqual(hiddenTabs([40, 40, 40, 40, 40], 120, 30, 0), [2, 3, 4]);
});

test('overflowMenu hides the tabs that do not fit behind the "..." trigger and lists them in its menu, pinning the active tab', () => {
    globalThis.document = { createElement: tag => ({ tag, attrs: {}, setAttribute(n, v) { this.attrs[n] = v; }, set value(v) { this.attrs.value = v; }, get value() { return this.attrs.value; } }) };
    try {
        const tabs = [tab('a', { width: 40 }), tab('b', { width: 40 }), tab('c', { width: 40, disabled: true }), tab('d', { width: 40 })];
        const m = make({ value: 'd', overflow: 'menu' }, tabs);
        m.list.clientWidth = 120;
        m.el.overflowMenu();
        assert.deepEqual(tabs.map(t => t.overflowHidden), [false, true, true, false], 'the tabs that do not fit (from the end, skipping the active one) are hidden; a (fits) and d (active, pinned) stay visible');
        assert.equal(m.more.hidden, false);
        assert.equal(m.more.children.length, 2);
        assert.equal(m.more.children[0].attrs.value, 'b'); assert.equal(m.more.children[1].attrs.value, 'c');
        assert.equal(m.more.children[1].disabled, true, 'a disabled hidden tab is a disabled menu item');
    } finally { delete globalThis.document; }
});

test('overflowMenu shows nothing extra and hides the trigger when every tab fits, or the mode is not menu', () => {
    const tabs = [tab('a', { width: 40 }), tab('b', { width: 40 })];
    const m = make({ value: 'a', overflow: 'menu' }, tabs);
    m.list.clientWidth = 300;
    m.el.overflowMenu();
    assert.equal(m.more.hidden, true); assert.deepEqual(tabs.map(t => t.overflowHidden), [false, false]);
    m.el.overflow = 'scroll'; m.more.hidden = false; tabs[0].overflowHidden = true;
    m.el.overflowMenu();
    assert.equal(m.more.hidden, true); assert.deepEqual(tabs.map(t => t.overflowHidden), [false, false]);
});

test('picking a tab from the overflow menu (pk-select) selects it; other events and other modes are ignored', () => {
    const [a, b] = [tab('a'), tab('b')];
    const { el, hostListeners } = make({ value: 'a', overflow: 'menu' }, [a, b]);
    globalThis.ResizeObserver = undefined;
    globalThis.document = { createElement: () => ({ attrs: {}, setAttribute(n, v) { this.attrs[n] = v; } }) };
    try {
        el.connected();
        hostListeners['pk-select']({ detail: { value: 'b' } });
        assert.equal(el.value, 'b'); assert.equal(b.focused, 1);
        el.overflow = 'scroll';
        hostListeners['pk-select']({ detail: { value: 'a' } });
        assert.equal(el.value, 'b', 'ignored outside overflow="menu"');
    } finally { delete globalThis.document; }
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
