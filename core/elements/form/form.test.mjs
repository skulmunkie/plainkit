import test from 'node:test';
import assert from 'node:assert/strict';
import { messageFor, nameFor, shouldCheck } from './form.js';

const named = (o = {}, field = null) => ({ localName: 'pk-input', getAttribute: k => o.attrs?.[k] ?? null, closest: sel => (sel === 'pk-field' ? field : null), label: o.label, name: o.name });
test('nameFor prefers the pk-field label, then the control label, aria-label, label attribute, name and id', () => {
    assert.equal(nameFor(named({ label: 'Own' }, { label: ' Code ' })), 'Code');
    assert.equal(nameFor(named({ label: 'Own' })), 'Own');
    assert.equal(nameFor(named({ attrs: { 'aria-label': 'Aria', label: 'Attr' } })), 'Aria');
    assert.equal(nameFor(named({ attrs: { label: 'Attr' } })), 'Attr');
    assert.equal(nameFor(named({ name: 'code', attrs: { id: 'x' } })), 'code');
    assert.equal(nameFor(named({ attrs: { id: 'x' } })), 'x');
});
test('nameFor falls back to the tag and position so anonymous controls never read the same', () => {
    assert.equal(nameFor(named(), 0), 'pk-input 1');
    assert.notEqual(nameFor(named(), 0), nameFor(named(), 1));
    assert.equal(nameFor(named({}, { label: '' }), 2), 'pk-input 3');
});

const control = (validity, attrs = {}, message = 'Native.') => ({ validity: { valid: !Object.values(validity).some(Boolean), ...validity }, validationMessage: message, getAttribute: k => attrs[k] ?? null });

test('messageFor is empty when valid, prefers data-msg-<constraint>, then data-msg, then the native text', () => {
    assert.equal(messageFor(control({})), '');
    assert.equal(messageFor(control({ valueMissing: true }, { 'data-msg-required': 'Enter a name.' })), 'Enter a name.');
    assert.equal(messageFor(control({ patternMismatch: true }, { 'data-msg': 'Bad.' })), 'Bad.');
    assert.equal(messageFor(control({ tooShort: true })), 'Native.');
});
test('messageFor reports the highest-priority failed constraint', () => {
    const c = control({ valueMissing: true, patternMismatch: true }, { 'data-msg-required': 'Required.', 'data-msg-pattern': 'Pattern.' });
    assert.equal(messageFor(c), 'Required.');
});
test('shouldCheck: blur mode checks on leaving, input mode while typing, submit mode never live, and an error already showing re-checks as you type', () => {
    assert.equal(shouldCheck('blur', 'blur', false), true);
    assert.equal(shouldCheck('blur', 'input', false), false);
    assert.equal(shouldCheck('blur', 'input', true), true);
    assert.equal(shouldCheck('input', 'input', false), true);
    assert.equal(shouldCheck('submit', 'blur', false), false);
    assert.equal(shouldCheck('submit', 'input', true), true);
});
