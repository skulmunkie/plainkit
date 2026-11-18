// pk-markdown resolveUrl (#2012): a JS-only function(url, kind) that replaces baseUrl; its results still pass the scheme allow-list.
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
const all = (n, tag, r = []) => { if (n.tag === tag) r.push(n); n.kids.forEach(k => all(k, tag, r)); return r; };

const make = markdown => {
    const warns = [], content = { addEventListener() {}, replaceChildren(f) { this.drawn = f; } };
    class Host {
        part() { return content; }
        emit() { return true; }
        warnOnce(key) { warns.push(key); }
        requestUpdate() { this.updated(); }
    }
    const el = new (behaviour(Host))();
    Object.assign(el, { ownerDocument: doc, isConnected: true, markdown });
    el.connected();
    return { el, content, warns };
};
const settle = () => new Promise(r => setTimeout(r, 60));
const hrefs = c => all(c.drawn, 'a').map(a => a.attrs.href), srcs = c => all(c.drawn, 'img').map(a => a.attrs.src);

test('resolveUrl rewrites links and images, gets the kind, and wins over baseUrl', async () => {
    const { el, content } = make('[a](x.md) ![i](y.png)');
    const seen = [];
    el.baseUrl = 'https://base.test/';
    el.resolveUrl = (u, kind) => { seen.push([u, kind]); return 'https://cdn.test/' + kind + '/' + u; };
    await settle();
    assert.deepEqual(hrefs(content), ['https://cdn.test/link/x.md']);
    assert.deepEqual(srcs(content), ['https://cdn.test/image/y.png']);
    assert.deepEqual(seen, [['x.md', 'link'], ['y.png', 'image']]);
});

test('setting resolveUrl redraws; clearing it falls back', async () => {
    const { el, content } = make('[a](x.md)');
    el.updated(); await settle();
    assert.deepEqual(hrefs(content), ['x.md']);
    el.resolveUrl = u => 'https://h.test/' + u; await settle();
    assert.deepEqual(hrefs(content), ['https://h.test/x.md']);
    el.resolveUrl = null; await settle();
    assert.deepEqual(hrefs(content), ['x.md']);
});

test('a hook result off the allow-list is dropped; null drops; a throw keeps the address and warns once', async () => {
    const { el, content, warns } = make('[a](x.md) [b](y.md) ![i](p.png) ![j](q.png)');
    el.resolveUrl = u => ({ 'x.md': JS + 'alert(1)', 'y.md': null, 'p.png': 'data:image/svg+xml,x', 'q.png': 'mailto:' })[u];
    await settle();
    assert.ok(!srcs(content).some(s => s.startsWith('data:') || s.startsWith('mailto:')));
    assert.ok(!hrefs(content).some(s => s.startsWith(JS)));
    const t = make('[a](x.md)');
    t.el.resolveUrl = () => { throw new Error('boom'); };
    await settle();
    assert.deepEqual(hrefs(t.content), ['x.md']);
    assert.deepEqual(t.warns, ['resolveUrl']);
    assert.equal(warns.length, 0);
});

test('a non-function is ignored', () => {
    const { el } = make('x');
    el.resolveUrl = 'not a function';
    assert.equal(el.resolveUrl, null);
});
