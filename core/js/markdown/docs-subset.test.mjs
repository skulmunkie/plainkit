// pk-markdown documentation subset (#2012): tables, images, h4-h6, heading ids, URL resolving, hostile input.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDocs as parseMarkdown } from './docs.js';
import { renderDocs as renderMarkdown } from './docs.js';

const JS = 'java' + 'script:';
class N {
    constructor(tag, text) { this.tag = tag; this.text = text; this.kids = []; this.attrs = {}; }
    appendChild(k) { this.kids.push(k); return k; }
    setAttribute(n, v) { this.attrs[n] = String(v); }
}
const doc = { createElement: t => new N(t), createTextNode: s => new N('#text', s), createDocumentFragment: () => new N('#frag') };
const walk = (n, f) => { f(n); n.kids.forEach(k => walk(k, f)); };
const find = (f, tag) => { const r = []; walk(f, n => { if (n.tag === tag) r.push(n); }); return r; };
const render = (s, o) => renderMarkdown(s, doc, o);

test('table: head, body, alignment, ragged rows, escaped pipe', () => {
    const f = render('| Key | Meaning |\n|:---|---:|\n| a | first \\| x |\n| b |\n\nafter');
    assert.equal(find(f, 'table').length, 1);
    assert.equal(find(f, 'thead').length, 1);
    assert.equal(find(f, 'tbody')[0].kids.length, 2);
    assert.equal(find(f, 'th')[0].attrs.class, 'pk-md-left');
    assert.equal(find(f, 'th')[1].attrs.class, 'pk-md-right');
    assert.equal(find(f, 'tr')[2].kids.length, 2);
    assert.equal(find(f, 'td')[1].kids[0].text, 'first | x');
    assert.equal(find(f, 'p').length, 1);
    assert.equal(find(f, 'div')[0].attrs.tabindex, '0');
});

test('a pipe line without a delimiter row is a paragraph', () => {
    assert.deepEqual(parseMarkdown('a | b\nc | d').c.map(b => b.t), ['p']);
});

test('headings 4 to 6; 7 hashes is a paragraph', () => {
    assert.deepEqual(parseMarkdown('#### a\n##### b\n###### c\n####### d').c.map(b => b.t + (b.n ?? '')), ['h4', 'h5', 'h6', 'p']);
});

test('heading ids: github style slug, de-duplicated, only with ids', () => {
    const f = render('# Hello, World!\n## Hello, World!\n### Hello, World!\n#### Über uns', { ids: true });
    assert.deepEqual(['h1', 'h2', 'h3', 'h4'].map(t => find(f, t)[0].attrs.id), ['hello-world', 'hello-world-1', 'hello-world-2', 'über-uns']);
    assert.equal(find(render('# A'), 'h1')[0].attrs.id, undefined);
});

test('image: img with lazy loading; unsafe source becomes the alt text', () => {
    const f = render('![a diagram](img/d.svg) ![x](' + JS + 'alert(1)) ![y](mailto:someone)');
    const img = find(f, 'img');
    assert.equal(img.length, 1);
    assert.deepEqual(img[0].attrs, { alt: 'a diagram', src: 'img/d.svg', loading: 'lazy' });
    assert.equal(find(f, 'a').length, 0);
});

test('resolve hook: applied to href and src with the kind; a result that is unsafe is dropped', () => {
    const seen = [];
    const f = render('[p](../o.md) [h](#top) ![i](a/b.png) [bad](x)', {
        resolve: (u, kind) => { seen.push([u, kind]); return u === 'x' ? JS + 'alert(1)' : 'https://docs.test/' + u; },
    });
    assert.deepEqual(seen, [['../o.md', 'link'], ['a/b.png', 'image'], ['x', 'link']]);
    assert.equal(find(f, 'a')[0].attrs.href, 'https://docs.test/../o.md');
    assert.equal(find(f, 'a')[1].attrs.href, '#top');
    assert.equal(find(f, 'img')[0].attrs.src, 'https://docs.test/a/b.png');
    assert.equal(find(f, 'a').length, 2);
});

test('hostile table, image and heading input: no script, no event or style attribute, linear time', () => {
    const src = ['| <img src=x onerror=alert(1)> | `a` |', '|---|---|', '| [x](' + JS + 'a) | ![](' + JS + 'b) |',
        '#### <script>alert(1)</script> " onclick="x', '![" onerror="x](a.png "t")', '![' .repeat(5000), '|'.repeat(5000), '| a |\n|-|\n' + '| b |\n'.repeat(3000)].join('\n');
    const t = Date.now();
    const f = render(src, { ids: true });
    assert.ok(Date.now() - t < 2000);
    walk(f, n => {
        for (const [k, v] of Object.entries(n.attrs)) {
            assert.ok(['href', 'src', 'alt', 'rel', 'class', 'id', 'loading', 'tabindex'].includes(k), k);
            if (k === 'href' || k === 'src') assert.ok(!v.includes('script:'), v);
            if (k === 'id') assert.match(v, /^[\p{L}\p{N}_-]+$/u);
        }
    });
    assert.equal(find(f, 'script').length, 0);
});
