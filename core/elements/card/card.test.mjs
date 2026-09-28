import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const read = ext => fs.readFileSync(fileURLToPath(new URL(`./card.${ext}`, import.meta.url)), 'utf8');
const meta = JSON.parse(read('meta.json'));
const prop = name => meta.props.find(p => p.name === name);

// Issue #21: flush removed the content padding, and the heading row lost its padding with it.
test('a flush card keeps the padding of its heading row and drops only the body padding', () => {
    const css = read('css');
    assert.ok(css.includes(':host([flush]) [part="content"] { padding: 0; }'));
    const rule = css.match(/:host\(\[flush\]\) \[part="header"\] \{([^}]*)\}/);
    assert.ok(rule, 'a flush header rule');
    assert.match(rule[1], /padding: var\(--pk-card-padding, var\(--space-4\) 1\.25rem\)/);
    assert.match(rule[1], /margin-bottom: 0/);
});

test('the meta says the heading keeps its padding', () => {
    assert.match(prop('flush').description, /heading row keeps its padding/);
});

// Issue #486: the state machine. Stub base, no DOM (same approach as states-page.test.mjs).
import behaviour from './card.js';
const fakeEl = tag => ({ localName: tag, attrs: {}, children: [], ownerDocument: { createElement: fakeEl }, setAttribute(k, v) { this.attrs[k] = String(v); }, append(...k) { this.children.push(...k); }, replaceChildren(...k) { this.children = k; }, addEventListener(type, fn) { (this.on ??= {})[type] = fn; }, set textContent(v) { this._t = v; }, get textContent() { return this._t; } });
const make = (props = {}) => {
    const parts = { link: { setAttribute() {}, removeAttribute() {} }, header: {}, media: {}, footer: {}, body: { children: ['slotted'] }, state: fakeEl('div') };
    const el = new (behaviour(class { part(n) { return parts[n]; } slotted() { return []; } warnOnce() {} get ownerDocument() { return { createElement: fakeEl }; } }))();
    Object.assign(el, { heading: 'Revenue', href: '', state: 'ready' }, props);
    return { el, parts, drawn: () => parts.state.children[0] };
};

test('state is a reflected enum defaulting to ready, with the four values', () => {
    const p = prop('state');
    assert.equal(p.type, 'enum'); assert.equal(p.default, 'ready'); assert.equal(p.reflect, true);
    assert.deepEqual(p.values, ['ready', 'loading', 'empty', 'error']);
});

test('ready (and no state at all) draws nothing and leaves the slotted body alone', () => {
    for (const state of ['ready', undefined]) {
        const { el, parts, drawn } = make({ state });
        el.updated();
        assert.equal(drawn(), undefined);
        assert.deepEqual(parts.body.children, ['slotted']);
    }
});

test('loading draws a labelled skeleton', () => {
    const { el, drawn } = make({ state: 'loading' });
    el.updated();
    assert.equal(drawn().localName, 'pk-skeleton');
    assert.equal(drawn().attrs.label, 'Loading Revenue');
    const { el: e2, drawn: d2 } = make({ state: 'loading', stateHeading: 'Loading sales' });
    e2.updated();
    assert.equal(d2().attrs.label, 'Loading sales');
});

test('empty draws pk-empty-state with the heading and description', () => {
    const { el, drawn } = make({ state: 'empty', stateHeading: 'No orders', stateDescription: 'Come back later.' });
    el.updated();
    assert.equal(drawn().localName, 'pk-empty-state');
    assert.equal(drawn().attrs.heading, 'No orders');
    assert.equal(drawn().attrs.description, 'Come back later.');
});

test('error draws a danger pk-alert; Retry only when a retry callback is set, and clicking calls it', () => {
    const { el, drawn } = make({ state: 'error', stateDescription: 'Timed out.' });
    el.updated();
    assert.equal(drawn().localName, 'pk-alert');
    assert.equal(drawn().attrs.kind, 'danger');
    assert.equal(drawn().children.length, 0, 'no Retry without a callback');
    let calls = 0;
    const { el: e2, drawn: d2 } = make({ state: 'error', retry: () => { calls++; } });
    e2.updated();
    const retry = d2().children[0];
    assert.equal(retry.localName, 'pk-button');
    retry.on.click();
    assert.equal(calls, 1);
});

test('changing state swaps what is drawn; back to ready clears it', () => {
    const { el, drawn } = make({ state: 'loading' });
    el.updated();
    assert.equal(drawn().localName, 'pk-skeleton');
    el.state = 'empty'; el.updated();
    assert.equal(drawn().localName, 'pk-empty-state');
    el.state = 'ready'; el.updated();
    assert.equal(drawn(), undefined);
});

test('the CSS shows the body for ready and the state region for every other state', () => {
    const css = read('css');
    assert.ok(css.includes('[part="state"], :host([state]:not([state="ready"])) [part="body"] { display: none; }'));
    assert.ok(css.includes(':host([state]:not([state="ready"])) [part="state"] { display: block; }'));
    assert.match(read('html'), /<div part="body"><slot><\/slot><\/div><div part="state"><\/div>/);
});
