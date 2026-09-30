// Unit tests for pk-note-page: builds a pk-stack > pk-heading + pk-card from config, rebuilding only when config actually changes.
// Stub base, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './note-page.js';

const fakeEl = tag => ({
    localName: tag, attrs: {}, children: [],
    setAttribute(k, v) { this.attrs[k] = String(v); },
    append(...k) { this.children.push(...k); },
    replaceChildren(...k) { this.children = k; },
    ownerDocument: { createElement: fakeEl },
    set textContent(v) { this._t = v; }, get textContent() { return this._t; },
});

const make = () => {
    const body = fakeEl('div');
    const fakeRoot = { querySelectorAll: () => [], matches: () => false };
    const el = new (behaviour(class {
        part(n) { return n === 'body' ? body : undefined; }
        get ownerDocument() { return { createElement: fakeEl }; }
        get shadowRoot() { return fakeRoot; }
    }))();
    el.config = null;
    return { el, body };
};

test('connected builds a pk-stack with a heading and a card once (idempotent)', () => {
    const { el, body } = make();
    el.config = { heading: 'About', body: 'Some prose.' };
    el.connected();
    assert.equal(body.children.length, 1);
    const stack = body.children[0];
    assert.equal(stack.localName, 'pk-stack');
    assert.equal(stack.attrs.gap, 'md');
    const [heading, card] = stack.children;
    assert.equal(heading.localName, 'pk-heading');
    assert.equal(heading.attrs.level, '1');
    assert.equal(heading.textContent, 'About');
    assert.equal(card.localName, 'pk-card');
    assert.equal(card.attrs.heading, undefined, 'no card heading without config.cardHeading');
    assert.equal(card.children[0].textContent, 'Some prose.');
    el.connected();
    assert.equal(body.children.length, 1, 'connected is idempotent');
});

test('cardHeading sets the card title', () => {
    const { el, body } = make();
    el.config = { heading: 'About', body: 'Text', cardHeading: 'About this page' };
    el.connected();
    const card = body.children[0].children[1];
    assert.equal(card.attrs.heading, 'About this page');
});

test('changed("config") rebuilds only when the config actually changed', () => {
    const { el, body } = make();
    el.config = { heading: 'A', body: 'x' };
    el.connected();
    const firstStack = body.children[0];
    el.changed('config');
    assert.equal(body.children[0], firstStack, 'same config, no rebuild');
    el.config = { heading: 'B', body: 'y' };
    el.changed('config');
    assert.notEqual(body.children[0], firstStack);
    assert.equal(body.children[0].children[0].textContent, 'B');
});

test('changed() ignores unrelated prop names', () => {
    const { el, body } = make();
    el.config = { heading: 'A', body: 'x' };
    el.connected();
    const firstStack = body.children[0];
    el.changed('heading');
    assert.equal(body.children[0], firstStack);
});

test('missing config fields default to empty strings', () => {
    const { el, body } = make();
    el.config = {};
    el.connected();
    const [heading, card] = body.children[0].children;
    assert.equal(heading.textContent, '');
    assert.equal(card.children[0].textContent, '');
});
