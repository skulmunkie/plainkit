// pk-markdown documentation subset (#2012): baseUrl resolving, the render event and in-element anchors.
import test from 'node:test';
import assert from 'node:assert/strict';
import behaviour from './markdown.js';

const JS = 'java' + 'script:';
class N {
    constructor(tag, text) { this.tag = tag; this.text = text; this.kids = []; this.attrs = {}; }
    appendChild(k) { this.kids.push(k); return k; }
    setAttribute(n, v) { this.attrs[n] = String(v); }
}
const doc = { baseURI: 'https://site.test/app/', createElement: t => new N(t), createTextNode: s => new N('#text', s), createDocumentFragment: () => new N('#frag') };
const walk = (n, f) => { f(n); n.kids.forEach(k => walk(k, f)); };
const all = (n, tag) => { const r = []; walk(n, x => { if (x.tag === tag) r.push(x); }); return r; };

const make = () => {
    const events = [], warns = [], content = { listeners: {}, addEventListener(t, f) { this.listeners[t] = f; }, replaceChildren(f) { this.drawn = f; }, querySelectorAll() { return this.target ? [this.target] : []; } };
    class Host {
        part() { return content; }
        emit(name, detail) { events.push({ name, detail }); return true; }
        warnOnce(key, msg) { warns.push(key); }
    }
    const el = new (behaviour(Host))();
    Object.assign(el, { ownerDocument: doc, isConnected: true, markdown: '[o](../api/x.md) [t](#top) ![i](img/a.png) [abs](https://other.test/z)' });
    el.connected();
    return { el, events, warns, content };
};
const settle = () => new Promise(r => setTimeout(r, 60));

test('baseUrl: href and src carry the final address; absolute and #anchor links stay', async () => {
    const { el, content, events } = make();
    el.baseUrl = 'docs/guide/'; el.updated();
    await settle();
    assert.deepEqual(all(content.drawn, 'a').map(a => a.attrs.href), ['https://site.test/app/docs/api/x.md', '#top', 'https://other.test/z']);
    assert.equal(all(content.drawn, 'img')[0].attrs.src, 'https://site.test/app/docs/guide/img/a.png');
    assert.deepEqual(events.map(e => e.name), ['pk-markdown-render']);
    assert.equal(events[0].detail.root, content);
});

test('a changed baseUrl redraws, an unchanged one does not', async () => {
    const { el, events } = make();
    el.baseUrl = 'a/'; el.updated(); el.updated(); await settle();
    el.baseUrl = 'b/'; el.updated(); await settle();
    assert.equal(events.length, 2);
});

test('a baseUrl with a hostile or unusable scheme is ignored with one warning; links stay as written', async () => {
    for (const base of [JS + 'alert(1)//', 'mailto:someone', 'data:text/html,x']) {
        const { el, content, warns } = make();
        el.baseUrl = base; el.updated(); await settle();
        assert.deepEqual(all(content.drawn, 'a').map(a => a.attrs.href), ['../api/x.md', '#top', 'https://other.test/z'], base);
        assert.equal(warns.length, 1, base);
    }
});

test('a #anchor click scrolls to the heading inside the content and cancels the navigation', () => {
    const { content } = make();
    let scrolled = 0;
    content.target = { id: 'some-heading', scrollIntoView: () => { scrolled++; } };
    const e = { target: { closest: () => ({ getAttribute: () => '#some-heading' }) }, button: 0, preventDefault() { this.prevented = true; } };
    content.listeners.click(e);
    assert.equal(scrolled, 1);
    assert.equal(e.prevented, true);
    content.target = null;
    const e2 = { ...e, prevented: false, preventDefault() { this.prevented = true; } };
    content.listeners.click(e2);
    assert.equal(e2.prevented, false);
});
