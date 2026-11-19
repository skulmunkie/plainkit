// Row actions of pk-data-table (#2046): the pure parts of js/row-actions.js (the browser cases measure the column, the events and the menu).
import test from 'node:test';
import assert from 'node:assert/strict';
import { titleOf, rowItems, confirmOf } from '../js/row-actions.js';

const ACTIONS = [{ key: 'view', label: 'View' }, { key: 'edit', label: 'Edit' }, { key: 'delete', label: 'Delete', variant: 'warn' }];

test('the row title is the title column, else the first text column, else the id', () => {
    const cols = [{ key: 'qty', label: 'Qty', type: 'number' }, { key: 'name', label: 'Name' }, { key: 'po', label: 'PO', title: true }];
    assert.equal(titleOf(cols, { po: 'PO 1042', name: 'x' }, '7'), 'PO 1042');
    assert.equal(titleOf(cols.slice(0, 2), { qty: 3, name: 'Hinge' }, '7'), 'Hinge');
    assert.equal(titleOf(cols.slice(0, 1), { qty: 3 }, '7'), '7');
    assert.equal(titleOf(cols, { po: '' }, '7'), '7');
});

test('a row _actions object hides, disables and re-words actions without a callback', () => {
    const row = { _actions: { edit: { hidden: true }, delete: { disabled: true, hint: 'Posted orders cannot be deleted' } } };
    const items = rowItems(ACTIONS, row);
    assert.deepEqual(items.map(a => a.key), ['view', 'delete']);
    assert.equal(items[1].disabled, true); assert.equal(items[1].hint, 'Posted orders cannot be deleted');
    assert.equal(rowItems(ACTIONS, {}).length, 3); assert.equal(ACTIONS[2].disabled, undefined, 'the shared list is not changed');
});

test('warn confirms by default, confirm false opts out, confirm true or an object asks for any action, {title} is the row title', () => {
    assert.equal(confirmOf(ACTIONS[1], 'Order 1'), null);
    const d = confirmOf(ACTIONS[2], 'Order 1');
    assert.deepEqual(d, { heading: 'Delete Order 1?', message: undefined, confirmLabel: 'Delete', danger: true });
    assert.equal(confirmOf({ ...ACTIONS[2], confirm: false }, 'Order 1'), null);
    const c = confirmOf({ key: 'archive', label: 'Archive', confirm: { heading: 'Archive {title}?', message: '{title} leaves the list.', confirmLabel: 'Yes' } }, 'Order 2');
    assert.deepEqual(c, { heading: 'Archive Order 2?', message: 'Order 2 leaves the list.', confirmLabel: 'Yes', danger: true });
    assert.equal(confirmOf({ key: 'x', label: 'X', confirm: true }, 't').heading, 'X t?');
});
