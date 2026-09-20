// Unit tests for the tabs component's behaviour, run against the fake DOM. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, el, FakeEvent } from '../../tests/fake-dom.mjs';
import { initTabs, scrollLeftFor, indexAfterClose } from './tabs.js';

const tabsFixture = (mode = 'toggle', extra = {}) => {
    const doc = createDocument();
    const t = n => el(doc, 'button.tab', { role: 'tab' });
    const a = t(); a.classList.add('active'); a.setAttribute('aria-selected', 'true');
    const b = t(); const c = t();
    const closeB = el(doc, 'button.tab-close');
    const list = el(doc, 'div.tabs', { 'data-pk-tabs': mode, ...extra }, a, b, closeB, c);
    doc.documentElement.append(list);
    return { doc, list, a, b, c, closeB };
};

test('tabs: click selects when the tablist toggles, and sets aria-selected and tabindex', () => {
    const { doc, a, b } = tabsFixture();
    initTabs(doc);
    b.click();
    assert.equal(b.classList.contains('active'), true);
    assert.equal(a.classList.contains('active'), false);
    assert.equal(b.getAttribute('aria-selected'), 'true');
    assert.equal(a.getAttribute('aria-selected'), 'false');
    assert.equal(b.tabIndex, 0);
});

test('tabs: a host-owned tablist (no toggle value) is not changed by a click', () => {
    const { doc, a, b } = tabsFixture('');
    initTabs(doc);
    b.click();
    assert.equal(a.classList.contains('active'), true);
    assert.equal(b.classList.contains('active'), false);
});

test('tabs: arrow keys move focus and select the next tab', () => {
    const { doc, a, b } = tabsFixture();
    initTabs(doc);
    a.dispatchEvent(new FakeEvent('keydown', { key: 'ArrowRight' }));
    assert.equal(doc.activeElement, b);
    assert.equal(b.classList.contains('active'), true);
});

test('tabs: the close button fires pk-tab-close with the tab it belongs to', () => {
    const { doc, list, b, closeB } = tabsFixture();
    initTabs(doc);
    let seen = null;
    list.addEventListener('pk-tab-close', e => { seen = e.detail.tab; e.preventDefault(); });
    closeB.click();
    assert.equal(seen, b);
    assert.equal(list.children.includes(b), true, 'a prevented event leaves the tab in place');
});

test('tabs: data-pk-close="remove" removes the tab and selects a neighbour when it was active', () => {
    const { doc, list, a, b, closeB } = tabsFixture('toggle', { 'data-pk-close': 'remove' });
    initTabs(doc);
    b.click();
    closeB.click();
    assert.equal(list.children.includes(b), false);
    assert.equal(list.children.includes(closeB), false);
    assert.equal(a.classList.contains('active') || list.children.some(c => c.classList.contains('active')), true);
});

test('tabs: the active tab is scrolled into view when selected in a scrolling strip', () => {
    const { doc, list, c } = tabsFixture();
    list.clientWidth = 200; c.offsetLeft = 500; c.offsetWidth = 100;
    initTabs(doc);
    c.click();
    assert.equal(list.scrollLeft, 500 + 100 + 8 - 200);
});

test('scrollLeftFor keeps a visible tab where it is and reveals hidden ones on either side', () => {
    assert.equal(scrollLeftFor(50, 80, 300, 0), 0);
    assert.equal(scrollLeftFor(400, 80, 300, 0), 188);
    assert.equal(scrollLeftFor(10, 80, 300, 200), 2);
});

test('indexAfterClose picks the same slot, then the last, then none', () => {
    assert.equal(indexAfterClose(1, 4), 1);
    assert.equal(indexAfterClose(3, 4), 2);
    assert.equal(indexAfterClose(0, 1), -1);
});
