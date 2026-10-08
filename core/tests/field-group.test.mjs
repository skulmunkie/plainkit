// core/modules/field-group/field-group.js: the thin wrapper over the pk-field-group element. What it keeps: the call shape (fields, data, onChange, refresh, destroy),
// `when` as a function of the data, and `data` mutated in place. The kind table, the commit events, the conditional rendering and the form value are the element's
// (core/tests/field-kinds.test.mjs and the browser cases in tests/browser/cases-field-group.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mountFieldGroup } from '../modules/field-group/field-group.js';

class El {
    constructor(tag) { this.localName = tag; this.listeners = new Map(); this.parent = null; this.children = []; }
    get ownerDocument() { return doc; }
    append(kid) { this.children.push(kid); kid.parent = this; }
    remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; this.removed = true; }
    addEventListener(type, fn) { (this.listeners.get(type) ?? this.listeners.set(type, new Set()).get(type)).add(fn); }
    removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
    dispatchEvent(e) { for (const fn of this.listeners.get(e.type) ?? []) fn(e); }
    querySelectorAll() { return []; } // enough for loader.js's tagsIn() to find nothing and return quietly
}
const doc = { createElement: t => new El(t) };
const commit = (el, key, value) => el.dispatchEvent({ type: 'pk-change', detail: { key, value, values: {} } });

test('it mounts one pk-field-group in the container with the specs and a copy of the data', () => {
    const c = new El('div'), data = { name: 'Ada' };
    const group = mountFieldGroup(c, { fields: [{ key: 'name', label: 'Name', required: true }, { key: 'qty', label: 'Qty', kind: 'number' }], data });
    const [el] = c.children;
    assert.equal(c.children.length, 1); assert.equal(el.localName, 'pk-field-group');
    assert.deepEqual(el.fields, [{ key: 'name', label: 'Name', required: true }, { key: 'qty', label: 'Qty', kind: 'number' }]);
    assert.deepEqual(el.values, { name: 'Ada' }); assert.notEqual(el.values, data, 'the element gets a copy');
    group.destroy();
});

test('a committed change updates data[key] in place and calls onChange(key, value, data)', () => {
    const c = new El('div'), data = { name: '', active: false }, calls = [];
    const group = mountFieldGroup(c, { fields: [{ key: 'name', label: 'Name' }, { key: 'active', label: 'Active', kind: 'checkbox' }], data, onChange: (k, v, d) => calls.push([k, v, d === data]) });
    const [el] = c.children;
    commit(el, 'name', 'Ada'); commit(el, 'active', true);
    assert.deepEqual(data, { name: 'Ada', active: true });
    assert.deepEqual(calls, [['name', 'Ada', true], ['active', true, true]]);
    group.destroy();
});

test('`when` as a function gates the field through the element\'s visible() callback; as data it goes through to the element', () => {
    const c = new El('div');
    mountFieldGroup(c, { fields: [{ key: 'status', label: 'Status' }, { key: 'note', label: 'Note', when: d => d.status === 'closed' }, { key: 'rush', label: 'Rush', when: { field: 'status', equals: 'open' } }], data: {} });
    const [el] = c.children;
    assert.equal(el.fields.find(f => f.key === 'note').when, undefined, 'a function is not sent as data');
    assert.deepEqual(el.fields.find(f => f.key === 'rush').when, { field: 'status', equals: 'open' });
    assert.equal(el.visible({ key: 'note' }, { status: 'open' }), false);
    assert.equal(el.visible({ key: 'note' }, { status: 'closed' }), true);
    assert.equal(el.visible({ key: 'status' }, {}), true, 'a field with no function is always visible');
});

test('refresh(newData) hands the element the new values and keeps the same element; later commits write to the new object', () => {
    const c = new El('div'), first = { name: 'Ada' }, second = { name: 'Grace' };
    const group = mountFieldGroup(c, { fields: [{ key: 'name', label: 'Name' }], data: first });
    const [el] = c.children;
    group.refresh(second);
    assert.deepEqual(el.values, { name: 'Grace' }); assert.equal(c.children.length, 1);
    commit(el, 'name', 'Lin');
    assert.equal(second.name, 'Lin'); assert.equal(first.name, 'Ada');
    group.refresh();
    assert.deepEqual(el.values, { name: 'Lin' }, 'with no argument it re-reads the current data');
});

test('destroy() removes the element and stops listening, so a later commit no longer touches data', () => {
    const c = new El('div'), data = { name: '' };
    const group = mountFieldGroup(c, { fields: [{ key: 'name', label: 'Name' }], data });
    const [el] = c.children;
    group.destroy();
    assert.ok(el.removed); assert.equal(c.children.length, 0);
    commit(el, 'name', 'late');
    assert.equal(data.name, '', 'no listener left after destroy');
});
