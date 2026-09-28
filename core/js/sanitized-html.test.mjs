// Unit test for the one shared HTML sink pk-doc-page (and, until it moves onto that page type, the guides page) uses for markup a build step
// has already sanitised. No real DOM: a template stand-in records what it was given, so this only checks the sink's control flow (parse inert,
// import, then replace), the same spirit as the fakeEl doubles core/elements/*/*.test.mjs use.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fillSanitizedHtml } from './sanitized-html.js';

function fakeDoc() {
    const template = { content: 'PARSED-CONTENT', set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; } };
    return { template, createElement: tag => (tag === 'template' ? template : { tag }), importNode: (content, deep) => ({ imported: content, deep }) };
}

test('fillSanitizedHtml parses html inert in a <template> and imports it before replacing the container, never innerHTML on a live node', () => {
    const calls = [];
    const doc = fakeDoc();
    const container = { ownerDocument: doc, replaceChildren(...k) { calls.push(k); } };
    fillSanitizedHtml(container, '<p>hi</p>');
    assert.equal(doc.template.innerHTML, '<p>hi</p>');
    assert.deepEqual(calls, [[{ imported: 'PARSED-CONTENT', deep: true }]]);
});

test('falls back to the global document when the container has none', () => {
    const doc = fakeDoc();
    const g = globalThis.document;
    globalThis.document = doc;
    try {
        const calls = [];
        fillSanitizedHtml({ replaceChildren: (...k) => calls.push(k) }, '<b>x</b>');
        assert.equal(doc.template.innerHTML, '<b>x</b>');
        assert.equal(calls.length, 1);
    } finally {
        globalThis.document = g;
    }
});
