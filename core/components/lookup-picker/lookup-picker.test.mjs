// Unit tests for pk-lookup-picker: the pure rules, and the behaviour over a stub base (no DOM): a pick sets value, label and events, a stored value
// is labelled from selectedLabels or resolve(keys) without a refetch, and open/close raise the toggle event once.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour, { labelOf, labelMap, rowStep, limitSelection, tableConfig } from './lookup-picker.js';

globalThis.document ??= undefined;

test('labelOf shows the labelKey field, else the key', () => {
    assert.equal(labelOf({ id: 4, name: 'Acme' }, 'name', 'id'), 'Acme');
    assert.equal(labelOf({ id: 4 }, 'name', 'id'), '4');
    assert.equal(labelOf(undefined, 'name', 'id'), '');
});

test('labelMap accepts a map or an array of { key | value | id, label }', () => {
    assert.deepEqual(labelMap({ 1: 'A', 2: 'B' }), { 1: 'A', 2: 'B' });
    assert.deepEqual(labelMap([{ key: 1, label: 'A' }, { value: 2, label: 'B' }, { id: 3, label: 'C' }]), { 1: 'A', 2: 'B', 3: 'C' });
    assert.deepEqual(labelMap(null), {});
});

test('rowStep walks the rows with arrows, Home and End and stops at the ends', () => {
    assert.equal(rowStep(-1, 5, 'ArrowDown'), 0);
    assert.equal(rowStep(4, 5, 'ArrowDown'), 4);
    assert.equal(rowStep(0, 5, 'ArrowUp'), 0);
    assert.equal(rowStep(2, 5, 'Home'), 0);
    assert.equal(rowStep(2, 5, 'End'), 4);
    assert.equal(rowStep(2, 5, 'a'), null);
    assert.equal(rowStep(0, 0, 'ArrowDown'), null);
});

const make = props => {
    const events = [], parts = { control: { value: '', focus() { this.focused = true; } } };
    const Cls = behaviour(class {
        $ = {};
        part(n) { return parts[n]; }
        emit(name, detail) { events.push({ name, detail }); }
        dispatchEvent(e) { events.push({ name: e.type }); }
        requestUpdate() { this.updates = (this.updates ?? 0) + 1; }
        warnOnce(m) { this.warned = m; }
        matches() { return true; }
    });
    const el = new Cls();
    Object.assign(el, { open: false, value: '', rowKey: 'id', labelKey: 'name', selectedLabels: {} }, props);
    return { el, events, parts };
};

test('pick sets the value and label, closes, and raises input, change and pk-lookup-select', () => {
    const { el, events } = make({ open: true });
    el.pick({ id: '7', row: { id: 7, name: 'Acme' } });
    assert.equal(el.value, '7'); assert.equal(el.open, false);
    assert.equal(el.labelFor('7'), 'Acme');
    assert.deepEqual(events.map(e => e.name), ['pk-lookup-toggle', 'input', 'change', 'pk-lookup-select']);
    assert.deepEqual(events.at(-1).detail, { value: '7', label: 'Acme', row: { id: 7, name: 'Acme' } });
});

test('a stored value is labelled from selectedLabels, else resolve(keys) once, else its key', async () => {
    assert.equal(make({ selectedLabels: { 9: 'Nine' } }).el.labelFor('9'), 'Nine');
    assert.equal(make().el.labelFor('9'), '9', 'no label source: the key');
    const calls = [], { el } = make({ resolve: async keys => { calls.push(keys); return { 9: 'Nine' }; } });
    assert.equal(el.labelFor('9'), '', 'nothing shown until resolve answers');
    el.labelFor('9');
    await new Promise(r => setTimeout(r, 5));
    assert.deepEqual(calls, [['9']], 'asked once');
    assert.equal(el.labelFor('9'), 'Nine'); assert.equal(el.updates, 1);
});

test('a rejected resolve warns once and can be asked again', async () => {
    const { el } = make({ resolve: async () => { throw new Error('nope'); } });
    el.labelFor('3');
    await new Promise(r => setTimeout(r, 5));
    assert.match(el.warned, /nope/); assert.equal(el.$asked.size, 0, 'the key can be asked again');
});

test('mirror raises the toggle event only when the state changes, and a pick closes the popup and returns focus to the field', () => {
    const { el, events, parts } = make();
    el.mirror(true); el.mirror(true);
    assert.equal(events.filter(e => e.name === 'pk-lookup-toggle').length, 1);
    el.mirror(false);
    assert.equal(events.filter(e => e.name === 'pk-lookup-toggle').length, 2);
    el.mirror(true); el.pick({ id: '1', row: { id: 1, name: 'A' } });
    assert.ok(parts.control.focused, 'focus returns to the field');
});

test('limitSelection keeps the previous selection when the next would pass max, and 0 means no limit', () => {
    assert.deepEqual(limitSelection(['a'], ['a', 'b'], 2), { values: ['a', 'b'], refused: false });
    assert.deepEqual(limitSelection(['a', 'b'], ['a', 'b', 'c'], 2), { values: ['a', 'b'], refused: true });
    assert.deepEqual(limitSelection([], ['a', 'b', 'c'], 0), { values: ['a', 'b', 'c'], refused: false });
});

test('keys without a label go to one resolve call, each key asked once' , async () => {
    const calls = [], { el } = make({ resolve: async keys => { calls.push(keys); return { a: 'A', b: 'B' }; } });
    el.labelFor('a'); el.labelFor('b'); el.labelFor('a');
    await new Promise(r => setTimeout(r, 5));
    assert.deepEqual(calls, [['a', 'b']]);
    assert.equal(el.labelFor('b'), 'B');
});

test('tableConfig: defaults, then config, then plain props that differ from their default (#805)', () => {
    assert.deepEqual(tableConfig({ label: 'Customer', config: { columns: [{ key: 'a' }], pageSize: 5 } }), { searchLabel: 'Search Customer', label: 'Customer', columns: [{ key: 'a' }], pageSize: 5 });
    assert.deepEqual(tableConfig({ label: 'Customer', config: { columns: [{ key: 'a' }], pageSize: 5 }, columns: [{ key: 'b' }], pageSize: 10, searchLabel: 'Find' }), { searchLabel: 'Find', label: 'Customer', columns: [{ key: 'b' }], pageSize: 10 });
    assert.equal(tableConfig({ label: '', config: {}, columns: [], pageSize: 25, searchLabel: '' }).searchLabel, 'Search options', 'plain props left at their default change nothing');
});
