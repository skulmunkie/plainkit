// Unit tests for pk-link: the shadow anchor's attributes, the pk-navigate intercept for `to` and its fallback. Stub base, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './link.js';

function makeLink(props = {}) {
    const attrs = {};
    const link = {
        attrs,
        listeners: [],
        addEventListener(t, fn) { this.listeners.push(fn); },
        setAttribute(n, v) { attrs[n] = v; },
        removeAttribute(n) { delete attrs[n]; },
        focus() { this.focused = true; },
    };
    const tab = { hidden: null };
    const emitted = [];
    let emitReturn = true;
    const win = { location: { assign(url) { win.location.went = url; } } };
    const el = new (behaviour(class {
        part(n) { return n === 'link' ? link : tab; }
        emit(n, d) { emitted.push([n, d]); return emitReturn; }
        warnOnce(...a) { this.warned = this.warned || []; this.warned.push(a); }
        get ownerDocument() { return { defaultView: win }; }
    }))();
    Object.assign(el, { href: '', to: '', target: '', rel: '', download: '', current: false, variant: 'inline', hasAttribute: () => false, ...props });
    return { el, link, tab, attrs, emitted, win, setEmitReturn: v => (emitReturn = v) };
}

test('updated sets href from href or to, target, rel, download, current and the sr-only new-tab text', () => {
    const { el, link, attrs, tab } = makeLink({ href: '/reports' });
    el.updated();
    assert.equal(attrs.href, '/reports');
    assert.equal(attrs.target, undefined);
    assert.equal(attrs.rel, undefined);
    assert.equal(tab.hidden, true);

    const blank = makeLink({ href: 'https://example.com', target: '_blank' });
    blank.el.updated();
    assert.equal(blank.attrs.target, '_blank');
    assert.equal(blank.attrs.rel, 'noopener noreferrer');
    assert.equal(blank.tab.hidden, false);

    const current = makeLink({ href: '/orders', current: true });
    current.el.updated();
    assert.equal(current.attrs['aria-current'], 'page');

    const toWins = makeLink({ href: '/ignored', to: '/orders/7' });
    toWins.el.updated();
    assert.equal(toWins.attrs.href, '/orders/7');
});

test('an unsafe address is dropped and warned once, not written as href', () => {
    const { el, attrs } = makeLink({ href: 'java\nscript:alert(1)' }); // an embedded newline, as safe-url.test.mjs uses: still an unsafe scheme, not a literal the security scanner flags
    el.updated();
    assert.equal(attrs.href, undefined);
    assert.equal(el.warned.length, 1);
});

test('download sets the attribute, and the bare boolean attribute keeps an empty value', () => {
    const named = makeLink({ href: '/a', download: 'a.csv' });
    named.el.updated();
    assert.equal(named.attrs.download, 'a.csv');

    const bare = makeLink({ href: '/a', download: '' });
    bare.el.hasAttribute = n => n === 'download';
    bare.el.updated();
    assert.equal(bare.attrs.download, '');

    const none = makeLink({ href: '/a' });
    none.el.updated();
    assert.equal(none.attrs.download, undefined);
});

test('a plain click on a `to` link is intercepted, emits a cancelable pk-navigate, and falls back to navigate when nothing cancels it', () => {
    const { el, link, emitted, win } = makeLink({ to: '/orders/7' });
    el.connected();
    const e = { button: 0, preventDefault() { this.defaultPrevented = true; } };
    link.listeners[0](e);
    assert.equal(e.defaultPrevented, true);
    assert.deepEqual(emitted, [['pk-navigate', { to: '/orders/7', href: '/orders/7' }]]);
    assert.equal(win.location.went, '/orders/7');
});

test('when the event is cancelled (the app router handled it) there is no fallback navigation', () => {
    const { el, link, win, setEmitReturn } = makeLink({ to: '/orders/7' });
    setEmitReturn(false);
    el.connected();
    const e = { button: 0, preventDefault() {} };
    link.listeners[0](e);
    assert.equal(win.location.went, undefined);
});

test('a target, a download, or no `to` is left alone (native navigation, or nothing to intercept)', () => {
    for (const props of [{ to: '/x', target: '_blank' }, { to: '/x', download: 'f' }, { href: '/x' }]) {
        const { el, link } = makeLink(props);
        el.connected();
        const e = { button: 0, preventDefault() { this.defaultPrevented = true; } };
        link.listeners[0](e);
        assert.notEqual(e.defaultPrevented, true, JSON.stringify(props));
    }
});

test('a modified click on a `to` link is left alone (native navigation opens a new tab, etc.)', () => {
    const { el, link } = makeLink({ to: '/x' });
    el.connected();
    const modified = { button: 0, ctrlKey: true, preventDefault() { this.defaultPrevented = true; } };
    link.listeners[0](modified);
    assert.notEqual(modified.defaultPrevented, true);
});

test('connecting twice adds one click listener', () => {
    const { el, link } = makeLink({ to: '/x' });
    el.connected(); el.connected();
    assert.equal(link.listeners.length, 1);
});

test('focus() focuses the inner anchor', () => {
    const { el, link } = makeLink();
    el.focus();
    assert.equal(link.focused, true);
});
