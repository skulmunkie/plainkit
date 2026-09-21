// Unit tests for pk-dropdown's open/close protocol, trigger ARIA and keyboard entry. Stub base, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './dropdown.js';

const item = (props = {}) => ({ localName: 'pk-menu-item', type: 'item', disabled: false, focused: 0, focus() { this.focused++; }, ...props });

const make = (props = {}, rows = []) => {
    const listeners = {}; const emitted = []; const attrs = {};
    const trigger = { attrs, contains: n => n === trigger || n === trigger.child, child: { name: 'inside' }, setAttribute: (n, v) => { attrs[n] = v; }, focusCalls: 0, focus() { this.focusCalls++; } };
    const menu = { style: {}, removeAttribute() {} };
    const el = new (behaviour(class {
        slotted(name) { return name === 'trigger' ? [trigger] : rows; }
        part() { return menu; }
        addEventListener(t, fn) { listeners[t] = fn; }
        watchSlot() {}
        emit(n, d) { emitted.push([n, d]); return el.allow !== false; }
    }))();
    Object.assign(el, { open: false, keepOpen: false, placement: 'bottom-start' }, props);
    return { el, trigger, listeners, emitted, attrs };
};

test('the trigger is announced as opening a menu and tracks the open state', () => {
    const { el, attrs } = make();
    el.connected();
    assert.equal(attrs['aria-haspopup'], 'menu'); assert.equal(attrs['aria-expanded'], 'false');
    el.open = true; el.aria2();
    assert.equal(attrs['aria-expanded'], 'true');
});

test('clicking the trigger while closed opens; while open it asks to close with reason toggle and refocuses the trigger', () => {
    const { el, trigger, listeners, emitted } = make();
    el.connected();
    listeners.click({ target: trigger, detail: 1 });
    assert.equal(el.open, true); assert.deepEqual(emitted, []);
    listeners.click({ target: trigger.child, detail: 1 });
    assert.equal(el.open, false); assert.deepEqual(emitted, [['pk-close', { reason: 'toggle' }]]); assert.equal(trigger.focusCalls, 1);
});

test('a click outside the trigger does nothing', () => {
    const { el, listeners } = make();
    el.connected();
    listeners.click({ target: { other: true }, detail: 1 });
    assert.equal(el.open, false);
});

test('a cancelled pk-close keeps the menu open and focus where it is', () => {
    const { el, trigger } = make({ open: true });
    el.allow = false;
    el.request('escape');
    assert.equal(el.open, true); assert.equal(trigger.focusCalls, 0);
});

test('closing by an outside press does not steal focus back to the trigger', () => {
    const { el, trigger } = make({ open: true });
    el.request('outside');
    assert.equal(el.open, false); assert.equal(trigger.focusCalls, 0);
});

test('choosing an item closes with reason select unless keep-open is set', () => {
    const a = make(); a.el.connected(); a.el.open = true; a.listeners['pk-select']();
    assert.deepEqual(a.emitted, [['pk-close', { reason: 'select' }]]); assert.equal(a.el.open, false);
    const b = make({ keepOpen: true }); b.el.connected(); b.el.open = true; b.listeners['pk-select']();
    assert.equal(b.el.open, true); assert.deepEqual(b.emitted, []);
});

test('ArrowDown on the trigger opens and focuses the first enabled item, ArrowUp the last; headers, dividers and disabled rows are skipped', () => {
    const rows = [item({ type: 'header' }), item({ disabled: true }), item(), item(), item({ type: 'divider' })];
    const { el, trigger, listeners } = make({}, rows);
    el.connected();
    let prevented = 0;
    listeners.keydown({ key: 'ArrowDown', target: trigger, preventDefault() { prevented++; } });
    assert.equal(el.open, true); assert.equal(prevented, 1);
    assert.deepEqual(rows.map(r => r.focused), [0, 0, 1, 0, 0]);
    listeners.keydown({ key: 'ArrowUp', target: trigger, preventDefault() {} });
    assert.deepEqual(rows.map(r => r.focused), [0, 0, 1, 1, 0]);
});

test('with an empty menu the arrow keys open without throwing', () => {
    const { el, trigger, listeners } = make({}, []);
    el.connected();
    assert.doesNotThrow(() => listeners.keydown({ key: 'ArrowDown', target: trigger, preventDefault() {} }));
    assert.equal(el.open, true);
});

test('Tab inside an open menu closes it with reason tab; keys are ignored while closed', () => {
    const rows = [item()];
    const open = make({}, rows); open.el.connected(); open.el.open = true;
    open.listeners.keydown({ key: 'Tab', target: rows[0] });
    assert.deepEqual(open.emitted, [['pk-close', { reason: 'tab' }]]);
    const closed = make({}, rows); closed.el.connected();
    closed.listeners.keydown({ key: 'Tab', target: rows[0] });
    assert.deepEqual(closed.emitted, []);
});

test('closed apply leaves nothing behind; disconnected releases the position and outside-press subscriptions', () => {
    const { el } = make();
    let stopped = 0;
    el.$u = () => { stopped++; }; el.$o = () => { stopped++; };
    el.disconnected();
    assert.equal(stopped, 2); assert.equal(el.$u, null); assert.equal(el.$o, null);
    assert.doesNotThrow(() => el.disconnected());
});

test('show and hide are the open prop', () => {
    const { el } = make();
    el.show(); assert.equal(el.open, true);
    el.hide(); assert.equal(el.open, false);
});
