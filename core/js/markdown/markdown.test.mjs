// Pure Markdown core (#1486): parser, DOM renderer (against a recording document), editing commands, and a hostile corpus.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown } from './parse.js';
import { renderMarkdown, MAX_PREVIEW } from './render.js';
import { toggleBold, toggleItalic, toggleBullets, toggleNumbers, insertLink, continueList, pasteLink, toggleHeading, toggleQuote, toggleCode } from './commands.js';

const JS = 'java' + 'script:';
class N {
    constructor(tag, text) { this.tag = tag; this.text = text; this.kids = []; this.attrs = {}; }
    appendChild(k) { this.kids.push(k); return k; }
    setAttribute(n, v) { this.attrs[n] = String(v); }
}
const doc = { createElement: t => new N(t), createTextNode: s => new N('#text', s), createDocumentFragment: () => new N('#frag') };
const walk = (n, f) => { f(n); n.kids.forEach(k => walk(k, f)); };
const render = s => renderMarkdown(s, doc);
const tags = f => { const t = []; walk(f, n => t.push(n.tag)); return t; };
const textOf = f => { let s = ''; walk(f, n => { if (n.text !== undefined) s += n.text; }); return s; };

test('blocks: headings, paragraphs, lists with one nesting level, quote, fence', () => {
    const ast = parseMarkdown('# T\n\npara one\nline two\n\n- a\n  - b\n- c\n\n1. x\n2. y\n\n> q\n\n```js\n<b>\n```');
    assert.deepEqual(ast.c.map(b => b.t), ['h', 'p', 'ul', 'ol', 'q', 'code']);
    assert.equal(ast.c[2].items[0].sub.items.length, 1);
    assert.equal(ast.c[2].items.length, 2);
    assert.equal(ast.c[5].v, '<b>');
    assert.equal(ast.c[5].lang, 'js');
});

test('inlines: bold, italic, code, link, nesting, unmatched delimiters stay text', () => {
    const f = render('**b *i* j** `c` [t](https://x.test)');
    assert.deepEqual(tags(f).filter(t => t !== '#text'), ['#frag', 'p', 'strong', 'em', 'code', 'a']);
    assert.equal(textOf(render('a * b [no ** c')), 'a * b [no ** c');
});

test('raw HTML is text', () => {
    const f = render('<script>alert(1)</script> <b>x</b>');
    assert.ok(!tags(f).includes('script') && !tags(f).includes('b'));
    assert.equal(textOf(f), '<script>alert(1)</script> <b>x</b>');
});

test('link allow-list: http, https, mailto, relative only', () => {
    const hrefs = s => { const h = []; walk(render(s), n => n.attrs.href && h.push(n.attrs.href)); return h; };
    assert.deepEqual(hrefs('[a](http://x) [b](https://x) [c](mailto:a@b.c) [d](/p?q=1) [e](#f) [f](rel/x)'), ['http://x', 'https://x', 'mailto:a@b.c', '/p?q=1', '#f', 'rel/x']);
    assert.deepEqual(hrefs('[a](' + JS + 'alert(1)) [b](JaVa\tScRiPt:1) [c]( ' + JS + '1) [d](data:text/html,x) [e](vbscript:1) [f](ftp://x)'), []);
    // setAttribute does not decode entities, so this is just a (harmless) relative address
    assert.deepEqual(hrefs('[g](java&#115;cript:1)'), ['java&#115;cript:1']);
    walk(render('[a](https://x)'), n => { if (n.tag === 'a') assert.equal(n.attrs.rel, 'noopener noreferrer'); });
});

test('hostile corpus: no script, no on* or style attribute, no ' + JS + ' href, linear time', () => {
    const corpus = [
        '<script>alert(1)</script> **b** [x](' + JS + '1)', '<img src=x onerror=alert(1)>', '[x](java\nscript:alert(1))', '![i](' + JS + '1)', '<a href="' + JS + '1">x</a>',
        '*'.repeat(100_000), '['.repeat(100_000), '[a]('.repeat(30_000), '**a '.repeat(50_000), '`'.repeat(100_000), '> '.repeat(5_000) + 'x',
        '- '.repeat(5_000) + 'x', '  - a\n'.repeat(20_000), '*a **b *c **d *e **f *g **h *i** j* k** l* m** n* o', 'a'.repeat(1_000_000), '[a](' + 'b'.repeat(500_000) + ')',
        '\\'.repeat(100_000), '```\n'.repeat(20_000), '# '.repeat(50_000), '>'.repeat(100_000),
    ];
    for (const src of corpus) {
        const t0 = performance.now();
        const f = render(src);
        assert.ok(performance.now() - t0 < 1500, `slow on ${src.slice(0, 20)}`);
        walk(f, n => {
            assert.notEqual(n.tag, 'script');
            assert.notEqual(n.tag, 'img');
            for (const [k, v] of Object.entries(n.attrs)) {
                assert.ok(!/^on/i.test(k) && k !== 'style', k);
                if (k === 'href') assert.match(v, /^(https?:|mailto:|[^:]*$)/i);
            }
        });
    }
});

test('input over the cap is cut with a note', () => {
    const f = render('a'.repeat(MAX_PREVIEW + 10));
    assert.ok(f.kids.at(-1).attrs.class === 'pk-md-truncated');
});

test('round trip: text -> bold command -> unwrap restores the value, selections hold', () => {
    for (const v of ['word', 'a b c', 'emoji \u{1F600} x', 'שלום', 'line  \r\nnext  ']) {
        const e = v.length;
        const on = toggleBold(v, 0, e);
        assert.equal(on.text, `**${v}**`);
        assert.deepEqual([on.start, on.end], [2, 2 + e]);
        const off = toggleBold(on.text, on.start, on.end);
        assert.equal(off.text, v);
        assert.deepEqual([off.start, off.end], [0, e]);
        const it = toggleItalic(v, 0, e);
        assert.equal(toggleItalic(it.text, it.start, it.end).text, v);
    }
});

test('bold/italic: unwrap with the markers inside the selection, italic does not eat bold', () => {
    assert.equal(toggleBold('**word**', 0, 8).text, 'word');
    assert.equal(toggleItalic('*word*', 0, 6).text, 'word');
    assert.equal(toggleItalic('**word**', 2, 6).text, '***word***');
    assert.equal(toggleBold('a b', 2, 2).text, 'a ****b');
    assert.equal(toggleBold('x word y', 6, 2).text, 'x **word** y');
});

test('lists: prefix each line, remove on second use, numbering 1,2,3, switch kind', () => {
    const t = 'one\ntwo\nthree';
    const ul = toggleBullets(t, 0, t.length);
    assert.equal(ul.text, '- one\n- two\n- three');
    assert.equal(toggleBullets(ul.text, ul.start, ul.end).text, t);
    const ol = toggleNumbers(t, 1, 6);
    assert.equal(ol.text, '1. one\n2. two\nthree');
    assert.equal(toggleNumbers(ul.text, 0, ul.text.length).text, '1. one\n2. two\n3. three');
    assert.equal(toggleNumbers('1. one\n2. two', 0, 13).text, 'one\ntwo');
    assert.equal(toggleBullets('a\n\nb', 0, 4).text, '- a\n\n- b');
});

test('link: selection becomes the text; unsafe or malformed address is refused and nothing changes', () => {
    const ok = insertLink('see site now', 4, 8, 'https://x.test');
    assert.equal(ok.text, 'see [site](https://x.test) now');
    assert.equal(ok.text.slice(ok.start, ok.end), 'site');
    assert.equal(insertLink('x', 0, 0, 'https://a.b').text, '[https://a.b](https://a.b)x');
    for (const bad of ['' + JS + 'alert(1)', ' ' + JS + '1', 'data:x', '', 'http://a b', 'http://a)b']) {
        const r = insertLink('site', 0, 4, bad);
        assert.equal(r.text, 'site');
        assert.ok(r.error);
    }
});

test('Enter continues a list item and leaves the list on an empty one', () => {
    assert.equal(continueList('- one', 5, 5).text, '- one\n- ');
    assert.equal(continueList('  * a\n  * b', 11, 11).text, '  * a\n  * b\n  * ');
    const n = continueList('1. a\n9) b', 9, 9);
    assert.equal(n.text, '1. a\n9) b\n10) '); assert.equal(n.start, n.text.length);
    const out = continueList('- one\n- ', 8, 8);
    assert.equal(out.text, '- one\n'); assert.equal(out.start, 6);
    for (const [t, a, b] of [['plain', 5, 5], ['- one', 2, 2], ['- one', 0, 5], ['', 0, 0]]) assert.equal(continueList(t, a, b), null);
});

test('pasting an address over a selection links it; anything else is not taken', () => {
    const r = pasteLink('see site now', 4, 8, ' https://x.test\n');
    assert.equal(r.text, 'see [site](https://x.test) now'); assert.equal(r.text.slice(r.start, r.end), 'site');
    assert.equal(pasteLink('mail me', 0, 4, 'mailto:a@b.test').text, '[mail](mailto:a@b.test) me');
    for (const p of ['text', JS + 'alert(1)', 'http://a b', 'http://a)b', 'data:x', '']) assert.equal(pasteLink('site', 0, 4, p), null);
    assert.equal(pasteLink('site', 2, 2, 'https://x.test'), null); assert.equal(pasteLink('a\nb', 0, 3, 'https://x.test'), null);
});

test('heading, quote and code toggle on and off', () => {
    assert.equal(toggleHeading('title', 0, 5).text, '## title');
    assert.equal(toggleHeading('# title', 0, 7).text, '## title');
    assert.equal(toggleHeading('## title', 0, 8).text, 'title');
    assert.equal(toggleQuote('a\nb', 0, 3).text, '> a\n> b');
    assert.equal(toggleQuote('> a\n> b', 0, 7).text, 'a\nb');
    assert.equal(toggleCode('x word y', 2, 6).text, 'x `word` y');
    assert.equal(toggleCode('x `word` y', 3, 7).text, 'x word y');
});

test('commands clamp out-of-range selections', () => {
    assert.equal(toggleBold('ab', -5, 99).text, '**ab**');
    assert.equal(toggleBullets('', 0, 0).text, '- ');
});
