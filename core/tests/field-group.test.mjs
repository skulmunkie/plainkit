// core/modules/field-group/field-group.js: field specs -> pk-field + control DOM, initial values, commit-event two-way binding.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mountFieldGroup } from '../modules/field-group/field-group.js';

class El {
    constructor(tag) { this.localName = tag; this.attrs = new Map(); this.children = []; this.listeners = new Map(); this.value = ''; this.checked = false; this.parent = null; }
    get ownerDocument() { return doc; }
    setAttribute(k, v) { this.attrs.set(k, String(v)); }
    getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
    // Mirrors real DOM append(): appending an already-attached node moves it (removes it from its current parent first).
    append(...kids) {
        for (const kid of kids) {
            if (!(kid instanceof El)) { this.children.push(kid); continue; }
            if (kid.parent) kid.parent.children.splice(kid.parent.children.indexOf(kid), 1);
            this.children.push(kid);
            kid.parent = this;
        }
    }
    remove() { if (this.parent) { this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; } this.removed = true; }
    addEventListener(type, fn) { (this.listeners.get(type) ?? this.listeners.set(type, new Set()).get(type)).add(fn); }
    removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
    dispatchEvent(e) { for (const fn of this.listeners.get(e.type) ?? []) fn(e); }
    querySelectorAll() { return []; } // enough for loader.js's tagsIn() to find nothing and return quietly
}
const doc = { createElement: t => new El(t) };
const container = new El('div');
const commit = (control, type, detail) => control.dispatchEvent({ type, detail });

test('a plain field defaults to a text pk-input, wrapped in a pk-field carrying its label/hint/required', () => {
    const c = new El('div'); c.querySelectorAll = () => [];
    const group = mountFieldGroup(c, { fields: [{ key: 'name', label: 'Name', hint: 'Full name', required: true }], data: {} });
    const [field] = c.children;
    assert.equal(field.localName, 'pk-field');
    assert.equal(field.getAttribute('label'), 'Name'); assert.equal(field.getAttribute('hint'), 'Full name'); assert.equal(field.getAttribute('required'), '');
    const [control] = field.children;
    assert.equal(control.localName, 'pk-input'); assert.equal(control.getAttribute('type'), 'text'); assert.equal(control.getAttribute('name'), 'name');
    group.destroy();
});

test('kind maps to the right control tag and type, and type-specific attributes land on it', () => {
    const c = new El('div');
    const group = mountFieldGroup(c, {
        fields: [
            { key: 'qty', label: 'Qty', kind: 'number', min: '1', max: '99', step: '1', required: true },
            { key: 'notes', label: 'Notes', kind: 'textarea', maxlength: '200' },
            { key: 'active', label: 'Active', kind: 'checkbox' },
            { key: 'status', label: 'Status', kind: 'select', options: [{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }] },
        ],
        data: {},
    });
    const [qty, notes, active, status] = c.children.map(f => f.children[0]);
    assert.equal(qty.localName, 'pk-input'); assert.equal(qty.getAttribute('type'), 'number');
    assert.equal(qty.getAttribute('min'), '1'); assert.equal(qty.getAttribute('max'), '99'); assert.equal(qty.getAttribute('step'), '1');
    assert.equal(notes.localName, 'pk-textarea'); assert.equal(notes.getAttribute('maxlength'), '200');
    assert.equal(active.localName, 'pk-checkbox');
    assert.equal(status.localName, 'pk-select');
    assert.deepEqual(status.children.map(o => [o.getAttribute('value'), o.children[0]]), [['open', 'Open'], ['closed', 'Closed']]);
    group.destroy();
});

test('an unknown kind falls back to a text input rather than dropping the field silently', () => {
    const c = new El('div');
    const group = mountFieldGroup(c, { fields: [{ key: 'x', label: 'X', kind: 'bogus' }], data: {} });
    assert.equal(c.children[0].children[0].getAttribute('type'), 'text');
    group.destroy();
});

test('the initial control value/checked comes from data[key]', () => {
    const c = new El('div');
    const group = mountFieldGroup(c, {
        fields: [{ key: 'name', label: 'Name' }, { key: 'active', label: 'Active', kind: 'checkbox' }],
        data: { name: 'Ada', active: true },
    });
    const [name, active] = c.children.map(f => f.children[0]);
    assert.equal(name.value, 'Ada'); assert.equal(active.checked, true);
    group.destroy();
});

test('a committed value updates data[key] and calls onChange(key, value, data); checkbox commits through pk-change, everything else through pk-value-change', () => {
    const c = new El('div');
    const data = { name: '', active: false };
    const calls = [];
    const group = mountFieldGroup(c, {
        fields: [{ key: 'name', label: 'Name' }, { key: 'active', label: 'Active', kind: 'checkbox' }],
        data,
        onChange: (key, value, d) => calls.push([key, value, d === data]),
    });
    const [name, active] = c.children.map(f => f.children[0]);
    commit(name, 'pk-value-change', { value: 'Ada' });
    commit(active, 'pk-change', { checked: true });
    assert.deepEqual(data, { name: 'Ada', active: true });
    assert.deepEqual(calls, [['name', 'Ada', true], ['active', true, true]]);
    group.destroy();
});

test('refresh(newData) re-syncs every control from the new object without rebuilding the DOM', () => {
    const c = new El('div');
    const group = mountFieldGroup(c, { fields: [{ key: 'name', label: 'Name' }], data: { name: 'Ada' } });
    const control = c.children[0].children[0];
    assert.equal(control.value, 'Ada');
    group.refresh({ name: 'Grace' });
    assert.equal(control.value, 'Grace');
    assert.equal(c.children.length, 1, 'the same field element, not a new one');
    group.destroy();
});

test('a field with `when` starts hidden (removed from the container) when the predicate is false for the initial data', () => {
    const c = new El('div');
    const group = mountFieldGroup(c, {
        fields: [
            { key: 'status', label: 'Status', kind: 'select', options: [{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }] },
            { key: 'note', label: 'Note', required: true, when: data => data.status === 'closed' },
        ],
        data: { status: 'open' },
    });
    assert.equal(c.children.length, 1, 'the gated field is not in the DOM');
    assert.equal(c.children[0].getAttribute('label'), 'Status');
    group.destroy();
});

test('committing a value re-evaluates `when` for every field (not just the one that changed) and shows/hides accordingly', () => {
    const c = new El('div');
    const data = { status: 'open', note: '' };
    const group = mountFieldGroup(c, {
        fields: [
            { key: 'status', label: 'Status', kind: 'select', options: [{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }] },
            { key: 'note', label: 'Note', required: true, when: d => d.status === 'closed' },
        ],
        data,
    });
    const status = c.children[0].children[0];
    assert.equal(c.children.length, 1);
    commit(status, 'pk-value-change', { value: 'closed' });
    assert.equal(data.status, 'closed');
    assert.equal(c.children.length, 2, 'note is now shown');
    assert.equal(c.children[1].getAttribute('label'), 'Note');
    commit(status, 'pk-value-change', { value: 'open' });
    assert.equal(c.children.length, 1, 'note is hidden again');
});

test('refresh(newData) re-evaluates `when` against the new data', () => {
    const c = new El('div');
    const group = mountFieldGroup(c, {
        fields: [
            { key: 'status', label: 'Status' },
            { key: 'note', label: 'Note', when: d => d.status === 'closed' },
        ],
        data: { status: 'open' },
    });
    assert.equal(c.children.length, 1);
    group.refresh({ status: 'closed' });
    assert.equal(c.children.length, 2);
    assert.equal(c.children[1].getAttribute('label'), 'Note');
    group.destroy();
});

test('a field with no `when` is always visible', () => {
    const c = new El('div');
    const group = mountFieldGroup(c, { fields: [{ key: 'name', label: 'Name' }], data: {} });
    assert.equal(c.children.length, 1);
    group.refresh({ name: 'Ada' });
    assert.equal(c.children.length, 1);
    group.destroy();
});

test('destroy() removes the field elements and stops listening, so a later commit event no longer touches data', () => {
    const c = new El('div');
    const data = { name: '' };
    const group = mountFieldGroup(c, { fields: [{ key: 'name', label: 'Name' }], data });
    const [field] = c.children;
    const control = field.children[0];
    group.destroy();
    assert.ok(field.removed);
    commit(control, 'pk-value-change', { value: 'late' });
    assert.equal(data.name, '', 'no listener left after destroy');
});
