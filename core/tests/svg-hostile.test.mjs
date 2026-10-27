// SVG toolkit phase S5 part b (#431): fromSvg reads untrusted text. Every rule here is a test; none is weakened to fit. Node has no DOMParser, so a tiny XML
// reader (enough for these inputs: tags, quoted attributes, text, namespaces, comments; it throws on a mismatch like a strict parser) is injected as `parse`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { toSvg, fromSvg } from '../js/svg/io.js';
import { createSvgDoc, validateDoc, findNode, stats } from '../js/svg/model.js';
import { insert } from '../js/svg/ops.js';
import { LIMITS } from '../js/svg/allow.js';

const JS = 'java' + 'script:';
const SVG_NS = 'http://www.w3.org/2000/svg';
const DEC = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const dec = s => s.replace(/&(?:amp|lt|gt|quot|#39);/g, m => DEC[m]);

function parse(text) {
    const stack = [], top = () => stack[stack.length - 1];
    let root = null, i = 0;
    const lookup = (el, prefix) => { for (let e = el; e; e = e.parent) if (e.ns.has(prefix)) return e.ns.get(prefix); return null; };
    while (i < text.length) {
        if (text[i] !== '<') { const j = text.indexOf('<', i), t = text.slice(i, j < 0 ? text.length : j); if (top()) top().texts.push(dec(t)); i = j < 0 ? text.length : j; continue; }
        if (text.startsWith('<?', i)) { i = text.indexOf('?>', i) + 2; continue; }
        if (text.startsWith('<!--', i)) { i = text.indexOf('-->', i) + 3; continue; }
        if (text.startsWith('</', i)) { const j = text.indexOf('>', i), name = text.slice(i + 2, j).trim(); if (!top() || top().name !== name) throw new Error('mismatched tag'); stack.pop(); i = j + 1; continue; }
        const m = /^<([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/.exec(text.slice(i, i + 20000));
        if (!m) throw new Error('bad tag');
        const el = { name: m[1], parent: top() ?? null, ns: new Map(), attrs: [], children: [], texts: [] };
        for (const a of m[2].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
            const value = dec(a[2] ?? a[3]);
            if (a[1] === 'xmlns') el.ns.set('', value); else if (a[1].startsWith('xmlns:')) el.ns.set(a[1].slice(6), value);
            el.attrs.push({ name: a[1], value });
        }
        if (top()) top().children.push(el); else if (root) throw new Error('two roots'); else root = el;
        i += m[0].length;
        if (!m[3]) stack.push(el);
    }
    if (stack.length || !root) throw new Error('unclosed');
    const wrap = el => {
        const [p, l] = el.name.includes(':') ? el.name.split(':') : ['', el.name];
        const out = {
            localName: l, namespaceURI: lookup(el, p),
            attributes: el.attrs.map(a => ({ name: a.name, value: a.value, namespaceURI: a.name.includes(':') && !a.name.startsWith('xmlns') ? lookup(el, a.name.split(':')[0]) : null })),
            getAttribute: n => el.attrs.find(a => a.name === n)?.value ?? null,
            get children() { return el.children.map(wrap); },
            get textContent() { return el.texts.join('') + el.children.map(c => wrap(c).textContent).join(''); },
        };
        return out;
    };
    return { documentElement: wrap(root), getElementsByTagName: () => [] };
}
const read = (t, o = {}) => fromSvg(t, { parse, ...o });
const wrapSvg = (inner, attrs = '') => `<svg xmlns="${SVG_NS}" viewBox="0 0 100 50" width="100" height="50" ${attrs}>${inner}</svg>`;
const BAD = ['<script', 'onerror', JS, '<!ENTITY', '<foreignObject'];
const safe = (r, what) => {
    assert.deepEqual(validateDoc(r.doc), [], `${what}: the document is valid`);
    const out = toSvg(r.doc);
    for (const b of BAD) assert.ok(!out.toLowerCase().includes(b.toLowerCase()), `${what}: output has ${b}`);
    assert.ok(!/<[^>]*\son\w+=/.test(out), `${what}: handler attribute`);
};
const codes = r => r.problems.map(p => p.code);

test('a plain document reads: size, units, title, desc, shapes', () => {
    const r = read(wrapSvg('<title>Sign</title><desc>d</desc><rect x="1" y="2" width="3" height="4" fill="#c00"/><g><circle/><ellipse cx="1" cy="1" rx="2" ry="2"/></g>', '').replace('width="100"', 'width="100mm"'));
    assert.equal(r.doc.title, 'Sign'); assert.equal(r.doc.desc, 'd'); assert.equal(r.doc.units, 'mm'); assert.equal(r.doc.width, 100); assert.equal(r.doc.height, 50);
    assert.equal(r.doc.root.children[0].type, 'rect'); assert.equal(r.doc.root.children[0].attrs.fill, '#c00');
    assert.ok(r.problems.some(p => p.code === 'dropped-node' && p.path === 'svg/g[1]/circle[1]'), JSON.stringify(r.problems));
    safe(r, 'plain');
});

test('scripts, foreignObject, style, use, image and links are dropped and listed', () => {
    const r = read(wrapSvg(`<script>alert(1)</script><foreignObject><div/></foreignObject><style>*{}</style><use href="#a"/><image href="x.png"/><a href="${JS}alert(1)"><rect width="1" height="1"/></a><rect width="2" height="2"/>`));
    assert.equal(r.doc.root.children.length, 1);
    assert.equal(codes(r).filter(c => c === 'dropped-node').length, 6);
    safe(r, 'elements');
});

test('event handlers, href, xlink:href, javascript: and data: values are dropped attribute by attribute', () => {
    const r = read(`<svg xmlns="${SVG_NS}" xmlns:xlink="http://www.w3.org/1999/xlink" width="10" height="10"><rect onclick="x()" onerror="x()" width="1" height="1" fill="red" href="x" xlink:href="y" class="${JS}x" aria-label="data:text/html,x" title="ok"/></svg>`);
    const a = r.doc.root.children[0].attrs;
    assert.deepEqual(Object.keys(a).sort(), ['fill', 'height', 'title', 'width']);
    assert.ok(r.problems.some(p => p.path === 'svg/rect[1]@onclick'));
    safe(r, 'attrs');
});

test('a DTD with entity expansion is refused before parsing', () => {
    const lol = `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;&a;">]><svg xmlns="${SVG_NS}"><text>&b;</text></svg>`;
    for (const t of [lol, lol.toLowerCase(), '<!doctype svg>' + wrapSvg('')]) {
        const r = read(t);
        assert.deepEqual(codes(r), ['dtd']); assert.equal(r.problems[0].severity, 'error'); assert.equal(stats(r.doc).nodes, 1);
        safe(r, 'dtd');
    }
});

test('oversized and non-text input give an empty document and an error', () => {
    const big = read(' '.repeat(LIMITS.input + 1)); assert.deepEqual(codes(big), ['input-size']);
    const tight = read(wrapSvg(''), { limits: { input: 10 } }); assert.deepEqual(codes(tight), ['input-size']);
    for (const v of [null, undefined, 5, {}, []]) { const r = read(v); assert.deepEqual(codes(r), ['input-type']); safe(r, 'type'); }
});

test('malformed input and a root that is not svg in the SVG namespace', () => {
    for (const t of ['<svg', '<svg xmlns="' + SVG_NS + '"><g></svg>', '', `<html xmlns="${SVG_NS}"/>`, '<svg/>', '<svg xmlns="http://example.com/x"/>']) {
        const r = read(t); assert.deepEqual(codes(r), ['malformed'], t); safe(r, 'malformed');
    }
    const flagged = fromSvg(wrapSvg(''), { parse: () => ({ documentElement: parse(wrapSvg('')).documentElement, getElementsByTagName: () => [{}] }) });
    assert.deepEqual(codes(flagged), ['malformed']);
    assert.deepEqual(codes(fromSvg(wrapSvg(''), { parse: () => { throw new Error('boom'); } })), ['malformed']);
});

test('10000 levels of nesting stop at the depth limit with one limit problem', () => {
    const n = 10000, r = read(wrapSvg('<g>'.repeat(n) + '</g>'.repeat(n)));
    assert.ok(stats(r.doc).depth <= LIMITS.depth);
    assert.equal(r.problems.filter(p => p.code === 'limit').length, 1);
    safe(r, 'deep');
});

test('more nodes than the limit are cut with one limit problem', () => {
    const r = read(wrapSvg('<rect width="1" height="1"/>'.repeat(30)), { limits: { nodes: 10 } });
    assert.ok(stats(r.doc).nodes <= 10);
    assert.equal(r.problems.filter(p => p.code === 'limit').length, 1);
});

test('huge coordinates are clamped with one limit problem', () => {
    const r = read(wrapSvg('<rect x="1e30" y="-1e30" width="1e30" height="1" /><line x1="9e29" y1="0" x2="1" y2="1"/>'));
    const rect = r.doc.root.children[0].attrs;
    assert.equal(rect.x, LIMITS.coord); assert.equal(rect.y, -LIMITS.coord); assert.equal(rect.width, LIMITS.coord);
    assert.equal(r.problems.filter(p => p.code === 'limit').length, 1);
    safe(r, 'huge');
});

test('malformed numbers drop the attribute, not the document', () => {
    for (const v of ['NaN', '1e999', '--5', '', '5 5', 'Infinity', '0x10', '5em']) {
        const r = read(wrapSvg(`<rect x="${v}" y="1" width="2" height="2"/>`));
        const a = r.doc.root.children[0].attrs;
        assert.ok(!('x' in a), `x="${v}" was kept`); assert.equal(a.y, 1);
        assert.ok(r.problems.some(p => p.code === 'dropped-attr' && p.path === 'svg/rect[1]@x'), v);
        safe(r, v);
    }
});

test('foreign namespaces and an external use are dropped', () => {
    const r = read(`<svg xmlns="${SVG_NS}" xmlns:x="http://example.com/x" width="5" height="5"><x:rect width="1" height="1"/><use href="https://example.com/a.svg#b"/><rect width="1" height="1" x:evil="1"/></svg>`);
    assert.equal(r.doc.root.children.length, 1);
    assert.ok(r.problems.some(p => p.code === 'dropped-attr' && p.path === 'svg/rect[2]@x:evil'));
    safe(r, 'ns');
});

test('transforms, points, dashes, paths and text read; bad values are dropped', () => {
    const r = read(wrapSvg(`<g transform="translate(5 5) scale(2)"><path d="M0 0 L10 10 Z" stroke-dasharray="1 2"/><polyline points="0,0 1,1"/><text x="1" y="2">a &lt;b&gt;</text></g><rect width="1" height="1" transform="skewX(5)"/><polygon points="1 2 3"/>`));
    const g = r.doc.root.children[0];
    assert.deepEqual(g.attrs.transform, [2, 0, 0, 2, 5, 5]);
    assert.equal(g.children[0].attrs['stroke-dasharray'].length, 2); assert.deepEqual(g.children[1].attrs.points, [0, 0, 1, 1]); assert.equal(g.children[2].text, 'a <b>');
    assert.ok(!('transform' in r.doc.root.children[1].attrs));
    assert.equal(findNode(r.doc, r.doc.root.children[2].id).attrs.points, undefined);
    safe(r, 'values');
});

const docs = () => {
    const a = createSvgDoc({ width: 200, height: 100, units: 'mm', title: 'A "quoted" <title>', desc: 'x & y' });
    const b = insert(insert(a, { type: 'rect', attrs: { x: 1.5, y: 2, width: 40, height: 20, fill: '#c00', transform: [1, 0, 0, 1, 5, 5] } }).doc, { type: 'text', text: 'Hi <there> & "you"', attrs: { x: 1, y: 2 } }).doc;
    const c = insert(insert(createSvgDoc(), { type: 'g', attrs: { opacity: 0.5 }, children: [{ type: 'path', attrs: { d: [['M', 0, 0], ['C', 1, 2, 3, 4, 5, 6], ['Z']], 'stroke-dasharray': [1, 2] } }] }).doc, { type: 'polygon', attrs: { points: [0, 0, 5, 0, 5, 5] } }).doc;
    return [a, b, c];
};
test('fixed point: toSvg(fromSvg(toSvg(doc))) equals toSvg(doc) for three documents', () => {
    for (const d of docs()) {
        const text = toSvg(d), again = read(text);
        assert.deepEqual(again.problems.filter(p => p.severity === 'error'), [], text);
        assert.equal(toSvg(again.doc), text);
    }
});
