// The route-change behaviour shared by mountApp and the Blazor PkApp (#364, js/route-focus.js), on a stub document: the title, where focus goes,
// what is announced. The real-browser measurement is the case "route change bridge" in tests/browser/cases-app-frame.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageLoaded, routeChanged } from '../js/route-focus.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const el = (extra = {}) => ({ focused: 0, tabIndex: 0, closest: () => null, focus() { this.focused++; }, ...extra });
const live = () => ({ textContent: '' });

test('focus goes to the h1 and the page is announced', () => {
    const h1 = el(), main = el({ querySelector: () => h1, scrollIntoView() { this.scrolled = true; } }), l = live();
    pageLoaded(main, l, 'Orders');
    assert.equal(h1.focused, 1);
    assert.equal(h1.tabIndex, -1);
    assert.equal(l.textContent, 'Orders, page loaded');
    assert.equal(main.scrolled, true);
});

test('without an h1 the main region takes focus', () => {
    const main = el({ querySelector: () => null }), l = live();
    pageLoaded(main, l, 'Orders');
    assert.equal(main.focused, 1);
});

test('a failed page announces nothing and moves nothing unless the boundary title is its own', () => {
    const h1 = el(), main = el({ querySelector: () => h1 }), l = live();
    pageLoaded(main, l, 'Orders', true);
    assert.equal(h1.focused, 0);
    assert.equal(l.textContent, '');
});

test('routeChanged sets the title, makes one live region and says false without a main region', () => {
    const h1 = el(), main = el({ querySelector: () => h1 }), made = [];
    const doc = {
        title: '', byId: { 'pk-main': main },
        getElementById(id) { return this.byId[id] ?? null; },
        createElement() { const n = { setAttribute() {} }; made.push(n); return n; },
        body: { append(n) { doc.byId[n.id] = n; } },
    };
    assert.equal(routeChanged('Orders', 'Acme', doc), true);
    assert.equal(doc.title, 'Orders - Acme');
    routeChanged('Acme', 'Acme', doc);
    assert.equal(doc.title, 'Acme');
    assert.equal(made.length, 1);
    assert.equal(doc.byId['pk-route-live'].textContent, 'Acme, page loaded');
    doc.byId = {};
    assert.equal(routeChanged('Orders', 'Acme', doc), false);
});

test('the Blazor bridge and PkApp use it', () => {
    const blazor = p => fs.readFileSync(path.join(root, '..', 'blazor/src/PlainKit.Blazor', p), 'utf8');
    assert.match(blazor('wwwroot/plainkit.blazor.js'), /export const routeChanged = .*route-focus[.]js/);
    assert.match(blazor('Components/PkApp.razor'), /InvokeVoidAsync\("routeChanged"/);
});

test('a heading drawn inside an open shadow root takes focus (#1335)', () => {
    const h1 = el(), host = { shadowRoot: { querySelector: () => h1 } };
    const main = el({ querySelector: () => null, querySelectorAll: () => [{ shadowRoot: null }, host] }), l = live();
    pageLoaded(main, l, 'Orders');
    assert.equal(h1.focused, 1);
    assert.equal(main.focused, 0);
});
