// Unit tests for pk-settings-page: building sectioned fields, applying/reading values, dirty tracking, save/discard, and the error path.
// Stub base, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './settings-page.js';

const fakeEl = tag => ({
    localName: tag, attrs: {}, children: [], listeners: {}, hidden: false, disabled: false,
    setAttribute(k, v) { this.attrs[k] = String(v); },
    append(...k) { this.children.push(...k); },
    replaceChildren(...k) { this.children = k; },
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
    fire(type, e) { for (const fn of [...(this.listeners[type] ?? [])]) fn(e); },
    ownerDocument: { createElement: fakeEl },
    set textContent(v) { this._t = v; }, get textContent() { return this._t; },
});

const make = () => {
    const saved = fakeEl('pk-alert');
    const form = fakeEl('form');
    const sections = fakeEl('div');
    const bar = fakeEl('pk-form-actions');
    const status = fakeEl('pk-alert');
    const save = fakeEl('pk-button');
    const discard = fakeEl('pk-button');
    const empty = fakeEl('p');
    for (const p of [sections, bar, status, save, discard, empty]) p.ownerDocument = { createElement: fakeEl };
    const parts = { saved, form, sections, bar, status, save, discard, empty };
    const fakeRoot = { querySelectorAll: () => [], matches: () => false };
    const el = new (behaviour(class {
        part(n) { return parts[n]; }
        get ownerDocument() { return { createElement: fakeEl }; }
        get shadowRoot() { return fakeRoot; }
    }))();
    el.config = {};
    el.values = {};
    return { el, parts };
};

test('connected wires the form once (idempotent) and builds the initial sections', () => {
    const { el, parts } = make();
    el.config = { sections: [{ heading: 'Store', fields: [{ key: 'name', type: 'text', label: 'Name' }] }] };
    el.connected();
    el.connected();
    assert.equal(parts.sections.children.length, 1);
    const card = parts.sections.children[0];
    assert.equal(card.localName, 'pk-card');
    assert.equal(card.heading, 'Store');
});

test('an empty config.sections shows the empty-state part instead of rendering nothing, hidden again once sections exist', () => {
    const { el, parts } = make();
    el.buildSections();
    assert.equal(parts.empty.hidden, false);
    assert.equal(parts.sections.children.length, 0);

    el.config = { sections: [{ fields: [{ key: 'name', type: 'text' }] }] };
    el.buildSections();
    assert.equal(parts.empty.hidden, true);
    assert.equal(parts.sections.children.length, 1);
});

test('buildSections maps field types to controls (including switch and range) and only rebuilds when config.sections actually changes', () => {
    const { el, parts } = make();
    el.config = { sections: [{ heading: 'Store', fields: [
        { key: 'name', type: 'text', label: 'Name' },
        { key: 'kind', type: 'select', label: 'Kind', options: ['a', { value: 'b', label: 'B' }] },
        { key: 'sync', type: 'switch', label: 'Sync automatically' },
        { key: 'rate', type: 'range', label: 'Rate limit', min: 10, max: 120 },
    ] }] };
    el.buildSections();
    const stack = parts.sections.children[0].children[0];
    const [name, kind, sync, rateField] = stack.children;
    assert.equal(name.localName, 'pk-input'); assert.equal(name.label, 'Name'); assert.equal(name.showLabel, true);
    assert.equal(kind.localName, 'pk-select'); assert.equal(kind.children.length, 2);
    assert.equal(sync.localName, 'pk-switch'); assert.equal(sync.textContent, 'Sync automatically');
    assert.equal(rateField.localName, 'pk-field'); assert.equal(rateField.label, 'Rate limit');
    const range = rateField.children[0];
    assert.equal(range.localName, 'pk-range'); assert.equal(range.min, 10); assert.equal(range.max, 120); assert.equal(range.output, true);

    const before = parts.sections.children;
    el.buildSections(); // same config.sections: no rebuild
    assert.equal(parts.sections.children, before);
});

test('applyValues writes values into controls and takes a baseline; values() reads them back by key', () => {
    const { el } = make();
    el.config = { sections: [{ fields: [{ key: 'name', type: 'text' }, { key: 'sync', type: 'switch' }] }] };
    el.values = { name: 'Example store', sync: true };
    el.buildSections();
    assert.deepEqual(el.currentValues(), { name: 'Example store', sync: true });
});

test('the save bar is hidden until a field differs from the baseline, and discard restores it', () => {
    const { el, parts } = make();
    el.config = { sections: [{ fields: [{ key: 'name', type: 'text' }] }] };
    el.values = { name: 'Example store' };
    el.buildSections();
    assert.equal(parts.bar.hidden, true, 'no changes yet');

    el.$controls.name.el.value = 'Changed';
    el.paint();
    assert.equal(parts.bar.hidden, false);
    assert.equal(parts.status.textContent, 'Unsaved changes');

    el.discard();
    assert.equal(el.$controls.name.el.value, 'Example store');
    assert.equal(parts.bar.hidden, true);
});

test('saveNow calls save(values), hides the bar, shows the saved message, and takes a new baseline', async () => {
    const { el, parts } = make();
    el.config = { sections: [{ fields: [{ key: 'name', type: 'text' }] }] };
    el.values = { name: 'Example store' };
    el.buildSections();
    el.$controls.name.el.value = 'Changed';
    el.paint();

    let received;
    el.save = async values => { received = values; };
    await el.saveNow();
    assert.deepEqual(received, { name: 'Changed' });
    assert.equal(parts.bar.hidden, true);
    assert.equal(parts.saved.hidden, false);

    el.$controls.name.el.value = 'Changed again';
    el.paint();
    assert.equal(parts.saved.hidden, true, 'editing again hides the saved message');
});

test('a rejecting save() shows the error in the bar status and keeps the bar open', async () => {
    const { el, parts } = make();
    el.config = { sections: [{ fields: [{ key: 'name', type: 'text' }] }] };
    el.values = { name: 'Example store' };
    el.buildSections();
    el.$controls.name.el.value = 'Changed';
    el.paint();

    el.save = async () => { throw new Error('network down'); };
    await el.saveNow();
    assert.equal(parts.status.kind, 'danger');
    assert.equal(parts.status.textContent, 'network down');
    assert.equal(parts.saved.hidden, true);
});

test('saveNow does nothing without a save callback (no throw)', async () => {
    const { el, parts } = make();
    await el.saveNow();
    assert.equal(parts.saved.hidden, false, 'untouched: the stub never sets it');
});
