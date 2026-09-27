// The "not ready" content a page type shows in place of its own (js/page-states.js): loading, empty, error, forbidden - a shared,
// framework-free helper so every page type looks and behaves the same, instead of each hand-rolling its own version.
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderState, STATES } from '../js/page-states.js';

class El {
    constructor(tag) { this.localName = tag; this.children = []; this.attrs = {}; this.text = ''; this.listeners = {}; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return this.attrs[k] ?? null; }
    append(...kids) { this.children.push(...kids); }
    replaceChildren(...kids) { this.children = kids; }
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
    fire(type) { for (const fn of this.listeners[type] ?? []) fn(); }
    get ownerDocument() { return DOC; }
    get textContent() { return this.text; }
    set textContent(v) { this.text = v; this.children = []; }
}
const DOC = { createElement: t => new El(t) };
const container = () => { const c = new El('div'); c.ownerDocument; return c; };

test('STATES lists ready plus the four non-ready states', () => {
    assert.deepEqual(STATES, ['ready', 'loading', 'empty', 'error', 'forbidden']);
});

test('an unknown state throws (a caller mistake, not a runtime condition)', () => {
    assert.throws(() => renderState(container(), 'nope'), TypeError);
});

test('ready clears the container and draws nothing, so the caller can draw its own content', () => {
    const c = container();
    c.append(new El('p'));
    renderState(c, 'ready');
    assert.deepEqual(c.children, []);
});

test('loading draws a labelled skeleton', () => {
    const c = container();
    renderState(c, 'loading', { label: 'Loading orders' });
    assert.equal(c.children.length, 1);
    assert.equal(c.children[0].localName, 'pk-skeleton');
    assert.equal(c.children[0].getAttribute('label'), 'Loading orders');
});

test('loading with no label falls back to a generic one', () => {
    const c = container();
    renderState(c, 'loading');
    assert.equal(c.children[0].getAttribute('label'), 'Loading');
});

test('empty and forbidden draw pk-empty-state with the given heading and description, or a default heading', () => {
    const empty = container();
    renderState(empty, 'empty', { heading: 'No orders', description: 'Try a different filter.' });
    assert.equal(empty.children[0].localName, 'pk-empty-state');
    assert.equal(empty.children[0].getAttribute('heading'), 'No orders');
    assert.equal(empty.children[0].getAttribute('description'), 'Try a different filter.');

    const forbidden = container();
    renderState(forbidden, 'forbidden');
    assert.equal(forbidden.children[0].getAttribute('heading'), 'Not allowed');
});

test('error draws a danger pk-alert with the description as text, and a Retry action only when given retry', () => {
    const noRetry = container();
    renderState(noRetry, 'error', { description: 'The request failed.' });
    const alert = noRetry.children[0];
    assert.equal(alert.localName, 'pk-alert');
    assert.equal(alert.getAttribute('kind'), 'danger');
    assert.equal(alert.textContent, 'The request failed.');
    assert.equal(alert.children.length, 0, 'no retry button without opts.retry');

    let clicked = false;
    const withRetry = container();
    renderState(withRetry, 'error', { retry: () => { clicked = true; } });
    const retryBtn = withRetry.children[0].children[0];
    assert.equal(retryBtn.localName, 'pk-button');
    assert.equal(retryBtn.getAttribute('slot'), 'action');
    retryBtn.fire('click');
    assert.ok(clicked);
});

test('every call clears what was there before (no leftover children across state changes)', () => {
    const c = container();
    renderState(c, 'loading');
    renderState(c, 'error', { description: 'boom' });
    assert.equal(c.children.length, 1);
    assert.equal(c.children[0].localName, 'pk-alert');
});
