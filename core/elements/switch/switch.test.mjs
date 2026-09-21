// Unit tests for pk-switch: toggling, the two change events, form value, reset and restore. Stub base, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './switch.js';

const make = (props = {}) => {
    const emitted = []; const forms = []; const control = { listeners: [], addEventListener(t, fn) { this.listeners.push(fn); } };
    const el = new (behaviour(class { part() { return control; } emit(n, d) { emitted.push([n, d]); return true; } setFormValue(v) { forms.push(v); } }))();
    Object.assign(el, { checked: false, disabled: false, value: 'on' }, props);
    return { el, control, emitted, forms };
};

test('a press flips checked and raises change and pk-change with the new state', () => {
    const { el, control, emitted } = make();
    el.connected();
    control.listeners[0]();
    assert.equal(el.checked, true);
    assert.deepEqual(emitted, [['change', { checked: true }], ['pk-change', { checked: true }]]);
    control.listeners[0]();
    assert.equal(el.checked, false);
    assert.deepEqual(emitted.at(-1), ['pk-change', { checked: false }]);
});

test('a disabled switch ignores presses', () => {
    const { el, control, emitted } = make({ disabled: true });
    el.connected(); control.listeners[0]();
    assert.equal(el.checked, false); assert.deepEqual(emitted, []);
});

test('connecting twice adds one listener', () => {
    const { el, control } = make();
    el.connected(); el.connected();
    assert.equal(control.listeners.length, 1);
});

test('the form value is the value when on and nothing when off', () => {
    const { el, forms } = make({ value: 'yes' });
    el.updated(); el.checked = true; el.updated();
    assert.deepEqual(forms, [null, 'yes']);
});

test('form reset returns to the state at connection; restore reads the saved state', () => {
    const { el } = make({ checked: true });
    el.connected(); el.checked = false;
    el.onReset();
    assert.equal(el.checked, true);
    el.onRestore('unchecked'); assert.equal(el.checked, false);
    el.onRestore('checked'); assert.equal(el.checked, true);
    el.onRestore(undefined); assert.equal(el.checked, false);
});

// Every other form element (checkbox, input, select, range...) captures its reset value once. pk-switch used to take it again on every connect, so
// moving a toggled switch in the DOM made a later form reset restore the moved-time state, not the original (issue #98).
test('form reset still restores the original checked state after the switch is disconnected and reconnected while toggled', () => {
    const { el } = make({ checked: false });
    el.connected(); el.checked = true;
    el.disconnected?.(); el.connected();
    el.onReset();
    assert.equal(el.checked, false);
    // and the same for a switch that started on
    const on = make({ checked: true }).el;
    on.connected(); on.checked = false; on.connected(); on.onReset();
    assert.equal(on.checked, true);
});
