// Unit tests for pk-doc-page: building the shell and nav, the home list, loading an item, the pager, the error/retry path, and the three
// behaviours ported from the guides page (core/site/guides/page.js) - in-page anchor scroll (pk-navigate), focus on the title after a real
// navigation, and the first-load anchor settle. Stub base and a tiny fake DOM, no real browser (same spirit as tool-page.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './doc-page.js';

globalThis.CSS ??= { escape: s => s };
globalThis.requestAnimationFrame ??= fn => fn();

function matches(node, sel) {
    const idMatch = /^\[id="([^"]*)"\]$/.exec(sel);
    if (idMatch) return node.attrs?.id === idMatch[1];
    return node.localName === sel;
}

function fakeEl(tag) {
    const node = {
        localName: tag, attrs: {}, children: [], listeners: {}, dataset: {},
        setAttribute(k, v) { this.attrs[k] = String(v); },
        getAttribute(k) { return Object.hasOwn(this.attrs, k) ? this.attrs[k] : null; },
        hasAttribute(k) { return Object.hasOwn(this.attrs, k); },
        removeAttribute(k) { delete this.attrs[k]; },
        toggleAttribute(k, force) { const on = force ?? !node.hasAttribute(k); if (on) node.attrs[k] = ''; else delete node.attrs[k]; return on; },
        append(...k) { for (const c of k) if (c && typeof c === 'object') c.parentElement = node; node.children.push(...k); },
        replaceChildren(...k) { for (const c of k) if (c && typeof c === 'object') c.parentElement = node; node.children = k; },
        remove() { if (node.parentElement) node.parentElement.children = node.parentElement.children.filter(c => c !== node); },
        addEventListener(type, fn) { (node.listeners[type] ??= []).push(fn); },
        fire(type, e = {}) { for (const fn of [...(node.listeners[type] ?? [])]) fn(e); },
        querySelectorAll(sel) { const out = []; const walk = n => { for (const c of n.children ?? []) { if (c && typeof c === 'object' && matches(c, sel)) out.push(c); walk(c); } }; walk(node); return out; },
        querySelector(sel) { return node.querySelectorAll(sel)[0] ?? null; },
        closest(sel) { for (let n = node; n; n = n.parentElement) if (matches(n, sel)) return n; return null; },
        scrollIntoView() { node.$scrolled = (node.$scrolled ?? 0) + 1; },
        focus() { node.$focused = (node.$focused ?? 0) + 1; },
        ownerDocument: sharedDoc,
        set textContent(v) { this._t = v; }, get textContent() { return this._t; },
    };
    return node;
}

// fillSanitizedHtml (js/sanitized-html.js) parses html inert in a <template> and imports it: a fake <template> whose `content` is a marker
// object carrying the html, and importNode that just hands that marker back, is enough to prove the wiring without a real DOM. Every fakeEl's
// ownerDocument is this same object (not a fresh one each time), so the template/importNode pair it needs is always reachable.
const sharedDoc = {
    createElement: tag => (tag === 'template' ? { set innerHTML(v) { this.content = { html: v }; } } : fakeEl(tag)),
    importNode: (content, deep) => ({ localName: '#parsed', attrs: {}, children: [], html: content?.html, deep }),
};

function make() {
    const doc = sharedDoc;
    const events = [];
    class Host {
        get ownerDocument() { return doc; }
        append(...k) { this.children = (this.children ?? []).concat(k); }
        emit(name, detail) { events.push({ name, detail }); return true; }
        get log() { return { error() {} }; }
        warnOnce() {}
    }
    const el = new (behaviour(Host))();
    return { el, events };
}

test('connected builds the shell once (idempotent): nav, toggle, toc, title, summary, body, pager', () => {
    const { el } = make();
    el.config = {};
    el.connected();
    const nav = el.$nav, body = el.$body;
    el.connected();
    assert.equal(el.$nav, nav);
    assert.equal(el.$body, body);
    assert.ok(el.$title && el.$summary && el.$pager && el.$toc && el.$toggle);
});

test('with no current id, paints the home list from config.items, linked through href()', () => {
    const { el } = make();
    el.href = id => `#/docs/${id}`;
    el.config = { items: [{ id: 'a', title: 'Guide A' }, { id: 'b', title: 'Guide B' }], home: { title: 'Docs', summary: 'Start here' } };
    el.connected();
    assert.equal(el.$title.textContent, 'Docs');
    assert.equal(el.$summary.textContent, 'Start here');
    const list = el.$body.children[0];
    assert.equal(list.children.length, 2);
    const links = list.children.map(li => li.children[0]);
    assert.deepEqual(links.map(a => a.attrs.href), ['#/docs/a', '#/docs/b']);
    // The nav lists every item too, with a real href for each and nothing marked current.
    const items = el.$nav.querySelectorAll('pk-nav-item');
    assert.equal(items.length, 2);
    assert.equal(items[0].attrs.href, '#/docs/a');
    assert.ok(!items[0].hasAttribute('current') && !items[1].hasAttribute('current'));
});

test('config.search controls the nav\'s filterable attribute; only rebuilds nav items when the id list actually changes', () => {
    const { el } = make();
    el.config = { items: [{ id: 'a', title: 'A' }], search: false };
    el.connected();
    assert.ok(!el.$nav.hasAttribute('filterable'));
    const before = el.$nav.querySelectorAll('pk-nav-item');
    el.config = { items: [{ id: 'a', title: 'A (renamed)' }], search: true };
    el.changed('config');
    assert.ok(el.$nav.hasAttribute('filterable'));
    assert.equal(el.$nav.querySelectorAll('pk-nav-item')[0], before[0]); // same ids: no rebuild, so a renamed title here would not show; that is expected (config.items is the source of truth)
});

test('setting a current id loads it, paints title/summary/body from loadItem(), and marks it current in the nav', async () => {
    const { el } = make();
    el.loadItem = async id => ({ title: `Guide ${id}`, summary: 'Summary', html: `<p>body ${id}</p>` });
    el.config = { items: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }], id: 'b' };
    el.connected();
    await el.$pending;
    assert.equal(el.$title.textContent, 'Guide b');
    assert.equal(el.$summary.textContent, 'Summary');
    const items = el.$nav.querySelectorAll('pk-nav-item');
    assert.equal(items.find(i => i.dataset.docId === 'b').hasAttribute('current'), true);
    assert.equal(items.find(i => i.dataset.docId === 'a').hasAttribute('current'), false);
});

test('the pager links to the neighbouring items in config.items order', async () => {
    const { el } = make();
    el.href = id => `#/${id}`;
    el.loadItem = async () => ({ title: 't', summary: 's', html: '<p></p>' });
    el.config = { items: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }, { id: 'c', title: 'C' }], id: 'b' };
    el.connected();
    await el.$pending;
    const [prev, note, next] = el.$pager.children;
    assert.equal(prev.attrs.href, '#/a');
    assert.equal(note.children[0], '2 of 3');
    assert.equal(next.attrs.href, '#/c');
});

test('while an item loads, the page shows its own title/summary and pager from config.items, never the previous item\'s', async () => {
    const { el } = make();
    el.href = id => `#/${id}`;
    let release;
    el.loadItem = id => (id === 'b' ? new Promise(r => { release = () => r({ title: 'B full', summary: 's', html: '<p></p>' }); }) : { title: 'A full', summary: 'sa', html: '<p></p>' });
    const items = [{ id: 'a', title: 'A', summary: 'About A' }, { id: 'b', title: 'B', summary: 'About B' }];
    el.config = { items, id: 'a' };
    el.connected();
    await el.$pending;
    assert.equal(el.$title.textContent, 'A full');
    el.config = { items, id: 'b' };
    el.changed('config');
    assert.equal(el.$title.textContent, 'B', 'the new item\'s own title while it loads');
    assert.equal(el.$summary.textContent, 'About B');
    assert.equal(el.$body.children[0].localName, 'pk-skeleton');
    assert.equal(el.$toc.hidden, true, 'no table of contents while there is no article');
    assert.equal(el.$pager.children[0].attrs.href, '#/a', 'the pager is already the new item\'s');
    release();
    await el.$pending;
    assert.equal(el.$title.textContent, 'B full');
});

test('an unknown id paints a not-found notice instead of throwing', async () => {
    const { el } = make();
    el.loadItem = async () => null;
    el.config = { items: [{ id: 'a', title: 'A' }], id: 'missing' };
    el.connected();
    await el.$pending;
    assert.equal(el.$title.textContent, 'Not found');
    assert.equal(el.$body.children[0].localName, 'pk-empty-state');
});

test('a rejecting loadItem() shows the error state with Retry, which loads again', async () => {
    const { el } = make();
    let calls = 0;
    el.loadItem = async id => { calls++; if (calls === 1) throw new Error('boom'); return { title: 'ok', summary: '', html: '<p>ok</p>' }; };
    el.config = { items: [{ id: 'a', title: 'A' }], id: 'a' };
    el.connected();
    await el.$pending;
    const alert = el.$body.children[0];
    assert.equal(alert.localName, 'pk-alert');
    const retry = alert.children.find(c => c && c.localName === 'pk-button');
    await retry.listeners.click[0]();
    assert.equal(calls, 2);
    assert.equal(el.$title.textContent, 'ok');
});

test('a same-page link inside the article scrolls it and emits pk-navigate instead of touching history', () => {
    const { el, events } = make();
    el.config = {};
    el.connected();
    const heading = el.ownerDocument.createElement('h2');
    heading.setAttribute('id', 'usage');
    el.$body.append(heading);
    const link = el.ownerDocument.createElement('a');
    link.setAttribute('href', '#usage');
    el.$currentId = 'guide-a';
    const evt = { composedPath: () => [link], defaultPrevented: false, button: 0, preventDefault() { this.defaultPrevented = true; } };
    el.$body.fire('click', evt);
    assert.equal(evt.defaultPrevented, true);
    assert.equal(heading.$scrolled, 1);
    assert.deepEqual(events, [{ name: 'pk-navigate', detail: { id: 'guide-a', anchor: 'usage', replace: false } }]);
});

test('a link to another page (not a same-page fragment) is left alone: no scroll, no pk-navigate', () => {
    const { el, events } = make();
    el.config = {};
    el.connected();
    const link = el.ownerDocument.createElement('a');
    link.setAttribute('href', '/elsewhere');
    const evt = { composedPath: () => [link], defaultPrevented: false, button: 0, preventDefault() {} };
    el.$body.fire('click', evt);
    assert.equal(events.length, 0);
});

test('focus moves to the title after a real navigation (a different id), but not on the very first load', async () => {
    const { el } = make();
    el.loadItem = async id => ({ title: id, summary: '', html: '<p></p>' });
    el.config = { items: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }], id: 'a' };
    el.connected();
    await el.$pending;
    assert.equal(el.$title.$focused, undefined); // the first load never steals focus
    el.config = { items: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }], id: 'b' };
    el.changed('config');
    await el.$pending;
    assert.equal(el.$title.$focused, 1);
});

test('the first-load anchor settle retries the scroll once, shortly after, for elements still upgrading below the article', t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { el } = make();
    el.config = {};
    el.connected();
    const heading = el.ownerDocument.createElement('h2');
    heading.setAttribute('id', 'install');
    el.$body.append(heading);
    el.settle('install', true);
    assert.equal(heading.$scrolled, 1);
    t.mock.timers.tick(400);
    assert.equal(heading.$scrolled, 2);
});

test('settle does not retry when this was not the first load', t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { el } = make();
    el.config = {};
    el.connected();
    const heading = el.ownerDocument.createElement('h2');
    heading.setAttribute('id', 'install');
    el.$body.append(heading);
    el.settle('install', false);
    assert.equal(heading.$scrolled, 1);
    t.mock.timers.tick(1000);
    assert.equal(heading.$scrolled, 1);
});
