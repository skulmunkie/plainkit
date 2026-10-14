// Hostile route params and query values through every built-in page type, and the router's open-redirect rules (#362). Page types are thin: untrusted
// text must stay DATA (a property or textContent, never markup), nothing in a param may navigate by itself, and the router must refuse an off-origin target
// in hash and path mode. A DOM double whose markup sinks throw catches an injected string the moment it is written.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mountRouter } from '../js/router.js';
import { setLogLevel } from '../js/log.js';

setLogLevel('silent');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = 'java' + 'script:'; // built apart so the security scanner does not read the test data as a script URL
const HOSTILE = [
    SCRIPT + 'alert(1)', ' \t' + SCRIPT + 'alert(1)', 'jav\nascript:alert(1)', '//evil.example/x', '\\\\evil.example', 'https://evil.example/?next=//evil',
    '<img src=x onerror=alert(1)>', '"><script>alert(1)</script>', '</pk-heading><pk-button>', '__proto__', 'constructor', 'prototype', '../../etc/passwd', '%00%0d%0a',
    'x'.repeat(100000), '‮\u0000😀﻿', '{{7*7}}${7*7}', '__proto__[polluted]=1',
];

const sink = v => { throw new Error('markup sink used: ' + String(v).slice(0, 40)); };
class El {
    constructor(tag, doc) { this.localName = tag; this.ownerDocument = doc; this.children = []; this.attrs = new Map(); this.on = new Map(); this.text = ''; this.parent = null; this.hidden = false; }
    get innerHTML() { return ''; } set innerHTML(v) { sink(v); }
    get outerHTML() { return ''; } set outerHTML(v) { sink(v); }
    insertAdjacentHTML(...a) { sink(a); }
    get textContent() { return this.text + this.children.map(c => c.textContent).join(''); }
    set textContent(v) { this.children = []; this.text = String(v); }
    append(...k) { for (const x of k) { if (typeof x === 'string') this.text += x; else { x.remove(); x.parent = this; this.children.push(x); } } }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); this.parent = null; }
    setAttribute(k, v) { this.attrs.set(k, String(v)); } getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
    hasAttribute(k) { return this.attrs.has(k); } removeAttribute(k) { this.attrs.delete(k); }
    addEventListener(t, f) { (this.on.get(t) ?? this.on.set(t, new Set()).get(t)).add(f); } removeEventListener(t, f) { this.on.get(t)?.delete(f); }
    dispatch(t, detail) { for (const f of [...(this.on.get(t) ?? [])]) f({ type: t, target: this, detail }); }
    all() { return this.children.flatMap(c => [c, ...c.all()]); }
    querySelectorAll() { return []; } querySelector() { return null; }
}
const makeHost = () => {
    const doc = { createElement: t => new El(t, doc), querySelectorAll: () => [], defaultView: null };
    return new El('div', doc);
};

const pageIds = fs.readdirSync(path.join(root, 'js/app/pages')).filter(f => f.endsWith('.js') && !f.startsWith('svc-') && !f.startsWith('dashboard-')).map(f => f.slice(0, -3));

for (const id of pageIds) {
    test(`page type "${id}": hostile route params and query values stay data (no markup, no navigation, no pollution)`, async () => {
        const factory = (await import(`../js/app/pages/${id}.js`)).default;
        for (const bad of HOSTILE) {
            const nav = [];
            const params = Object.create(null), query = Object.create(null);
            for (const k of ['id', 'name', 'anchor', 'step', 'q', 'next', 'tab']) { params[k] = bad; query[k] = bad; }
            const ctx = { route: { params, query, path: '/x', url: '/x' }, navigate: (...a) => { nav.push(a); return false; }, href: p => p, signal: new AbortController().signal };
            const host = makeHost();
            let cleanup;
            try { cleanup = await factory(host, { heading: bad, title: bad, description: bad, mount: () => {}, load: async () => ({ rows: [], total: 0 }), loadItem: async () => '', href: () => '/ok' }, ctx); }
            catch (err) { assert.fail(`${id} threw for ${JSON.stringify(bad.slice(0, 40))}: ${err.stack}`); }
            assert.equal(nav.length, 0, `${id}: a param navigated on its own`);
            for (const el of host.all()) assert.match(el.localName, /^(pk-[a-z-]+|div|span|main|section)$/, `${id}: unexpected element ${el.localName} from ${JSON.stringify(bad.slice(0, 40))}`);
            assert.equal({}.polluted, undefined);
            await Promise.resolve(typeof cleanup === 'function' ? cleanup() : cleanup?.());
        }
    });
}

// ---- the router: open redirects in hash and path mode ----
function fakeWin(hash = '', { pathname = '/app', search = '' } = {}) {
    const listeners = new Map();
    const win = {
        location: { hash, pathname, search, origin: 'http://x', href: 'http://x' + pathname + search + hash },
        history: { pushed: [], replaced: [], pushState: (s, t, u) => { win.history.pushed.push(u); }, replaceState: (s, t, u) => { win.history.replaced.push(u); } },
        addEventListener: (t, f) => { (listeners.get(t) ?? listeners.set(t, new Set()).get(t)).add(f); },
        removeEventListener: (t, f) => listeners.get(t)?.delete(f),
        fire: t => [...(listeners.get(t) ?? [])].forEach(f => f()),
    };
    globalThis.window = win;
    return win;
}
const routes = [{ path: '/', label: 'Home', children: [{ path: '/files', label: 'Files' }, { path: '/login', label: 'Login' }, { path: '/admin', label: 'Admin' }, { path: '/docs', label: 'Docs' }] }];
const OFF = ['//evil.example', 'https://evil.example', '/\\evil.example', '\\\\evil.example', '/\t/evil.example', SCRIPT + 'alert(1)', ' ' + SCRIPT + 'x', 'data:text/html,x', 'HTTP://EVIL', '///evil'];

test('the doc page type routes a hostile link target through ctx.navigate, which refuses it', async () => {
    const factory = (await import('../js/app/pages/doc.js')).default;
    const win = fakeWin('#/docs');
    const router = mountRouter(null, { routes, mode: 'hash' });
    for (const bad of OFF.slice(0, 4)) {
        const host = makeHost();
        const cleanup = factory(host, { href: () => bad }, { navigate: (to, o) => router.navigate(to, o), route: { params: {}, query: {} } });
        host.children.at(-1).dispatch('pk-navigate', { id: 'a', anchor: 'b' });
        cleanup();
    }
    assert.deepEqual(win.history.pushed.concat(win.history.replaced), []);
    router.destroy();
});

test('router, hash mode: an off-origin address in the hash, the query or a guard redirect never writes history', () => {
    const win = fakeWin('#//evil.example');
    let verdict = true;
    const router = mountRouter(null, { routes, mode: 'hash', guard: r => (r.path === '/admin' ? verdict : true) });
    assert.equal(router.current().status, 404, '#//evil is just an unknown path');
    assert.deepEqual(win.history.pushed.concat(win.history.replaced), []);
    for (const bad of ['#/login?next=https://evil.example', '#/login?next=//evil.example', '#/login?next=' + encodeURIComponent(SCRIPT + 'x'), '#/files?__proto__[x]=1&constructor[prototype][x]=1']) {
        win.location.hash = bad; win.fire('hashchange');
        assert.notEqual(router.current(), null);
        assert.equal(({}).x, undefined, 'no prototype pollution from the query');
    }
    for (const redirect of OFF) {
        verdict = { allow: false, redirect };
        win.location.hash = '#/admin'; win.fire('hashchange');
        assert.equal(router.current().status, 403, redirect);
    }
    for (const bad of OFF) assert.equal(router.navigate(bad), false, `navigate(${bad})`);
    assert.deepEqual(win.history.pushed.concat(win.history.replaced), [], 'nothing off-origin was ever written');
    router.destroy();
});

test('router, path mode: an off-origin path, query, alias or guard redirect never writes history', () => {
    for (const pathname of ['//evil.example', '/%2F%2Fevil', '/files/..//evil', '/\\evil.example']) {
        const win = fakeWin('', { pathname, search: '?next=https://evil.example' });
        const router = mountRouter(null, { routes, aliases: { '/old': '//evil.example', '/old2': SCRIPT + 'x', '/old3': () => 'https://evil.example' }, guard: r => (r.path === '/admin' ? { allow: false, redirect: '//evil.example' } : true) });
        assert.doesNotThrow(() => router.current());
        for (const bad of OFF) assert.equal(router.navigate(bad), false, `${pathname}: navigate(${bad})`);
        for (const u of win.history.pushed.concat(win.history.replaced)) assert.match(u, /^\/(?![/\\]).*$/, `${pathname}: wrote ${u}, which is not a same-origin path`);
        router.destroy();
    }
    for (const alias of ['//evil.example', SCRIPT + 'x', 'https://evil.example']) {
        const win = fakeWin('', { pathname: '/old' });
        const router = mountRouter(null, { routes, aliases: { '/old': alias } });
        for (const u of win.history.pushed.concat(win.history.replaced)) assert.match(u, /^\/(?![/\\]).*$/, `alias ${alias}: wrote ${u}`); // a string alias is normalised to a same-origin path, never kept as written
        router.destroy();
    }
});
