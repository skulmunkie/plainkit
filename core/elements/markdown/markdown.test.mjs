// pk-markdown: a read-only Markdown view. The rendering itself is js/markdown/'s (markdown.test.mjs there); here the link routing, the value change and the css are checked.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import behaviour, { isRelativeHref } from './markdown.js';

const read = ext => fs.readFileSync(fileURLToPath(new URL(`./markdown.${ext}`, import.meta.url)), 'utf8');
const css = read('css');
const tokens = fs.readFileSync(fileURLToPath(new URL('../../tokens/tokens.css', import.meta.url)), 'utf8');

test('isRelativeHref: only an address the page resolves itself', () => {
    for (const h of ['guide/intro', './a', '../a', '/docs/a', '?q=1', 'a.md#top']) assert.equal(isRelativeHref(h), true, h);
    for (const h of ['https://example.test', 'tel:5550100', '#top', '//cdn.example.test/a', '', null, undefined]) assert.equal(isRelativeHref(h), false, String(h));
});

const make = () => {
    const listeners = {}, events = [];
    class Host {
        part() { return { addEventListener: (type, fn) => { listeners[type] = fn; }, replaceChildren: (...c) => { this.$drawn = c; } }; }
        emit(name, detail) { events.push({ name, detail }); return !this.$cancel; }
    }
    const el = new (behaviour(Host))();
    el.connected();
    return { el, listeners, events };
};
const click = (href, init = {}) => {
    const e = { target: { closest: () => (href === undefined ? null : { getAttribute: () => href }) }, button: 0, defaultPrevented: false, prevented: false, preventDefault() { this.prevented = true; }, ...init };
    return e;
};

test('a relative link click is reported and left alone by default', () => {
    const { listeners, events } = make();
    const e = click('guide/intro');
    listeners.click(e);
    assert.deepEqual(events, [{ name: 'pk-link-click', detail: { href: 'guide/intro' } }]);
    assert.equal(e.prevented, false);
});

test('interceptLinks, or a cancelled pk-link-click, stops the navigation', () => {
    const a = make(); a.el.interceptLinks = true;
    const e1 = click('a'); a.listeners.click(e1);
    assert.equal(e1.prevented, true);
    const b = make(); b.el.$cancel = true;
    const e2 = click('a'); b.listeners.click(e2);
    assert.equal(e2.prevented, true);
});

test('absolute, anchor, modified and non-link clicks raise nothing', () => {
    const { listeners, events } = make();
    for (const e of [click('https://example.test'), click('#top'), click('a', { ctrlKey: true }), click('a', { button: 1 }), click(undefined)]) { listeners.click(e); assert.equal(e.prevented, false); }
    assert.equal(events.length, 0);
});

test('updated() draws the parsed text once per change, and not after the element left the page', async () => {
    const { el } = make();
    const drawn = [];
    const doc = { createElement: tag => ({ tag, kids: [], appendChild(c) { this.kids.push(c); }, setAttribute() {} }), createTextNode: v => ({ v }), createDocumentFragment: () => ({ kids: [], appendChild(c) { this.kids.push(c); } }) };
    Object.assign(el, { ownerDocument: doc, isConnected: true, part: () => ({ replaceChildren: n => drawn.push(n) }) });
    el.markdown = 'hello'; el.updated(); el.updated();
    await new Promise(r => setTimeout(r, 50));
    assert.equal(drawn.length, 1);
    el.markdown = 'again'; el.updated(); el.isConnected = false;
    await new Promise(r => setTimeout(r, 50));
    assert.equal(drawn.length, 1);
});

test('the css uses only tokens that exist and no literal colour or physical property', () => {
    for (const [, tok] of css.matchAll(/var\((--[\w-]+)[,)]/g)) assert.ok(tokens.includes(`${tok}:`), `${tok} exists`);
    assert.ok(!/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i.test(css), 'literal colour');
    assert.ok(!/\b(margin|padding|border)-(left|right|top|bottom)\b|(?<![\w-])(width|height)\s*:/.test(css), 'physical properties');
    assert.ok(css.includes(':host([hidden])'));
});
