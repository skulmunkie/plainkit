// Unit tests for pk-tool-page: building fields from config, collecting values, running, drawing the outcome, and the error/retry path.
// Stub base, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './tool-page.js';

const fakeEl = tag => ({
    localName: tag, attrs: {}, children: [], listeners: {},
    setAttribute(k, v) { this.attrs[k] = String(v); },
    append(...k) { this.children.push(...k); },
    replaceChildren(...k) { this.children = k; },
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
    fire(type, e) { for (const fn of [...(this.listeners[type] ?? [])]) fn(e); },
    ownerDocument: { createElement: fakeEl },
    set textContent(v) { this._t = v; }, get textContent() { return this._t; },
});

const make = () => {
    const run = fakeEl('pk-button');
    const form = fakeEl('form');
    const fields = fakeEl('div');
    const outcome = fakeEl('div');
    outcome.ownerDocument = { createElement: fakeEl };
    fields.ownerDocument = { createElement: fakeEl };
    const parts = { form, fields, run, outcome };
    const loaded = [];
    const fakeRoot = { querySelectorAll: () => [], matches: () => false };
    const el = new (behaviour(class {
        part(n) { return parts[n]; }
        get ownerDocument() { return { createElement: fakeEl }; }
        get shadowRoot() { return fakeRoot; }
    }))();
    el.config = {};
    el.runLabel = '';
    return { el, parts, loaded };
};

test('connected wires the form submit once (idempotent) and builds the initial fields', () => {
    const { el, parts } = make();
    el.config = { input: [{ key: 'text', type: 'textarea', label: 'Text' }] };
    el.connected();
    el.connected();
    assert.equal(parts.fields.children.length, 1);
    assert.equal(parts.fields.children[0].localName, 'pk-textarea');
});

test('buildFields maps field types to controls, sets a visible label, and only rebuilds when config.input actually changes', () => {
    const { el, parts } = make();
    el.config = { input: [
        { key: 'q', type: 'text', label: 'Query' },
        { key: 'n', type: 'number', label: 'Count' },
        { key: 'notes', type: 'textarea', label: 'Notes' },
        { key: 'kind', type: 'select', label: 'Kind', options: ['a', { value: 'b', label: 'B' }] },
    ] };
    el.buildFields();
    const [q, n, notes, kind] = parts.fields.children;
    assert.equal(q.localName, 'pk-input'); assert.equal(q.type, 'text'); assert.equal(q.label, 'Query'); assert.equal(q.showLabel, true);
    assert.equal(n.localName, 'pk-input'); assert.equal(n.type, 'number');
    assert.equal(notes.localName, 'pk-textarea');
    assert.equal(kind.localName, 'pk-select');
    assert.equal(kind.children.length, 2);
    assert.equal(kind.children[0].value, 'a'); assert.equal(kind.children[0].textContent, 'a');
    assert.equal(kind.children[1].value, 'b'); assert.equal(kind.children[1].textContent, 'B');

    const before = parts.fields.children;
    el.buildFields(); // same config.input: no rebuild
    assert.equal(parts.fields.children, before);
});

test('values() reads the current value of every built control by key', () => {
    const { el } = make();
    el.config = { input: [{ key: 'a', type: 'text' }, { key: 'b', type: 'number' }] };
    el.buildFields();
    el.$controls.a.value = 'hi';
    el.$controls.b.value = '3';
    assert.deepEqual(el.values(), { a: 'hi', b: '3' });
});

test('runNow shows loading, then draws the outcome for each type from the run() result', async () => {
    for (const [type, result, assertion] of [
        ['stat', { value: 3, label: 'words' }, el => { assert.equal(el.value, 3); assert.equal(el.label, 'words'); }],
        ['table', { columns: ['a'], rows: [{ a: 1 }] }, el => { assert.deepEqual(el.columns, ['a']); assert.deepEqual(el.rows, [{ a: 1 }]); }],
        ['code', 'console.log(1)', el => assert.equal(el.textContent, 'console.log(1)')],
        ['text', 'plain result', el => assert.equal(el.textContent, 'plain result')],
    ]) {
        const { el, parts } = make();
        el.config = { outcome: type };
        el.run = async () => result;
        await el.runNow();
        assertion(parts.outcome.children[0]);
    }
});

test('a rejecting run() shows the error state with Retry, which runs again', async () => {
    const { el, parts } = make();
    let calls = 0;
    el.config = { outcome: 'text' };
    el.run = async () => { calls++; if (calls === 1) throw new Error('boom'); return 'ok'; };
    await el.runNow();
    const alert = parts.outcome.children[0];
    assert.equal(alert.localName, 'pk-alert');
    assert.equal(alert.textContent, 'boom');
    const retryBtn = alert.children[0];
    await retryBtn.listeners.click[0]();
    assert.equal(calls, 2);
    assert.equal(parts.outcome.children[0].textContent, 'ok');
});

test('runNow does nothing without a run callback (no throw, no drawn outcome)', async () => {
    const { el, parts } = make();
    await el.runNow();
    assert.equal(parts.outcome.children.length, 0);
});

test('updated sets the Run button text from runLabel, defaulting to "Run"', () => {
    const { el, parts } = make();
    el.updated();
    assert.equal(parts.run.textContent, 'Run');
    el.runLabel = 'Count';
    el.updated();
    assert.equal(parts.run.textContent, 'Count');
});
