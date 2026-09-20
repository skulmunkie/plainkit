import test from 'node:test';
import assert from 'node:assert/strict';
import { optionsOf } from './radio-group.js';

const opt = (value, text, disabled = false) => ({ localName: 'option', textContent: ` ${text} `, getAttribute: k => (k === 'value' ? value : null), hasAttribute: k => k === 'disabled' && disabled });

test('optionsOf reads value, label and disabled from option nodes and ignores other nodes', () => {
    const list = optionsOf([opt('a', 'Alpha'), { localName: 'div' }, opt(null, 'Beta', true)]);
    assert.deepEqual(list, [{ value: 'a', label: 'Alpha', disabled: false }, { value: 'Beta', label: 'Beta', disabled: true }]);
});
