// Unit tests for the topbar component's behaviour, run against the fake DOM. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, el, FakeEvent } from '../../tests/fake-dom.mjs';
import { initSearchFields, nextSearchState } from './topbar.js';

const searchFixture = () => {
    const doc = createDocument();
    const toggle = el(doc, 'button.app-search-toggle');
    const input = el(doc, 'input.app-search-input');
    const close = el(doc, 'button.app-search-close');
    const box = el(doc, 'div.app-search', { 'data-pk-search': '' }, toggle, input, close);
    doc.documentElement.append(box);
    return { doc, box, toggle, input, close };
};

test('search field: the toggle opens the field and focuses the input', () => {
    const { doc, box, toggle, input } = searchFixture();
    initSearchFields(doc);
    toggle.click();
    assert.equal(box.classList.contains('is-field'), true);
    assert.equal(doc.activeElement, input);
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
});

test('search field: the close button and Escape close it and return focus to the toggle', () => {
    const { doc, box, toggle, input, close } = searchFixture();
    initSearchFields(doc);
    toggle.click(); close.click();
    assert.equal(box.classList.contains('is-field'), false);
    assert.equal(doc.activeElement, toggle);
    toggle.click();
    input.dispatchEvent(new FakeEvent('keydown', { key: 'Escape' }));
    assert.equal(box.classList.contains('is-field'), false);
});

test('search field: nextSearchState opens on toggle and focus, closes on close and Escape, ignores the rest', () => {
    assert.equal(nextSearchState(false, 'toggle'), true);
    assert.equal(nextSearchState(false, 'focus'), true);
    assert.equal(nextSearchState(true, 'close'), false);
    assert.equal(nextSearchState(true, 'Escape'), false);
    assert.equal(nextSearchState(true, 'x'), true);
});
