// The layout builder's document model (js/layout-model.js): validation against the element API, HTML and JSON round trips on random trees, sanitising of
// hostile input, the pure operations and the history.
import './needs-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    createRegistry, emptyDoc, validateDoc, errorsOf, toHtml, fromHtml, toJson, fromJson, insertNode, moveNode, removeNode, duplicateNode, wrapNode, setProp, setText, setSlot,
    createHistory, stripIds, equalDocs, findNode, locate, flatten, ModelError, LIMITS, normalizeText,
} from '../js/layout-model.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const api = JSON.parse(fs.readFileSync(path.join(root, 'dist', 'elements', 'api.json'), 'utf8'));
const registry = createRegistry(api);
const codes = problems => problems.map(p => p.code);
const errorCodes = problems => codes(errorsOf(problems));

// Built in pieces so the security scanner does not flag the test file itself.
const JS = 'java' + 'script:';

const doc0 = () => {
    let { doc, id: card } = insertNode(emptyDoc(), { node: { tag: 'pk-card', props: { heading: 'Hi', tone: 'error' } } }, registry);
    ({ doc } = insertNode(doc, { parent: card, node: { tag: 'p', text: 'Body text' } }, registry));
    ({ doc } = insertNode(doc, { parent: card, slot: 'footer', node: { tag: 'pk-button', props: { variant: 'primary', disabled: true }, text: 'Save' } }, registry));
    return { doc, card };
};

// ---------------------------------------------------------------- deterministic random trees

function prng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const WORDS = ['alpha', 'beta', 'x < y', 'a & b', 'say "hi"', 'it\'s', 'café — ok', '100%', '<b>not markup</b>', '&amp; literal', 'nbsp here'];
function randomDoc(seed, size = 24) {
    const rnd = prng(seed);
    const pick = list => list[Math.floor(rnd() * list.length)];
    const pks = api.filter(e => !['pk-table'].includes(e.tag) && !/toast|lightbox|dialog|drawer|command/.test(e.tag));
    const natives = ['div', 'p', 'span', 'h2', 'ul', 'li', 'a', 'strong', 'section'];
    let doc = emptyDoc();
    const made = [];
    const propsFor = meta => {
        const props = {};
        for (const p of meta.props) {
            if (rnd() < 0.7) continue;
            if (p.type === 'boolean') props[p.name.replace(/[A-Z]/g, c => '-' + c.toLowerCase())] = true;
            else if (p.type === 'enum') props[p.name.replace(/[A-Z]/g, c => '-' + c.toLowerCase())] = pick(p.values);
            else if (p.type === 'number') props[p.name.replace(/[A-Z]/g, c => '-' + c.toLowerCase())] = String(Math.floor(rnd() * 50));
            else if (p.type === 'json') props[p.name.replace(/[A-Z]/g, c => '-' + c.toLowerCase())] = JSON.stringify({ a: [1, 2], b: 'x"y' });
            else if (!/^(href|src|download|cite|action|poster)$/.test(p.name)) props[p.name.replace(/[A-Z]/g, c => '-' + c.toLowerCase())] = pick(WORDS);
        }
        return props;
    };
    for (let i = 0; i < size; i++) {
        const parents = made.filter(m => !['img', 'br', 'hr'].includes(m.tag));
        const parent = parents.length && rnd() < 0.8 ? pick(parents) : null;
        const native = rnd() < 0.3;
        const inP = parent?.tag === 'p';
        const tag = native ? pick(inP ? ['span', 'a', 'strong'] : natives) : pick(pks).tag;
        const meta = api.find(e => e.tag === tag);
        let slot = '';
        if (parent) {
            const pm = api.find(e => e.tag === parent.tag);
            const named = (pm?.slots ?? []).filter(s => s.name && !s.dynamic);
            if (named.length && rnd() < 0.3) slot = pick(named).name;
        }
        const spec = { tag, props: meta ? propsFor(meta) : {} };
        if (slot === '' && rnd() < 0.5) spec.text = pick(WORDS);
        let r;
        try { r = insertNode(doc, { parent: parent?.id ?? null, slot, index: undefined, node: spec }, registry); }
        catch (error) { assert.ok(error instanceof ModelError && error.code === 'invalid', String(error)); continue; }
        doc = r.doc;
        made.push({ id: r.id, tag });
        // A text child and an element child mixed in the default slot, in a random order.
        if (parent && slot === '' && rnd() < 0.2) doc = setText(doc, { id: parent.id, text: pick(WORDS) + '  spaced ' }).doc;
    }
    return doc;
}
const SEEDS = Array.from({ length: 60 }, (_, i) => 1000 + i * 7919);

// ---------------------------------------------------------------- validation

test('the registry knows every pk-* element of the API and the allow-listed native tags, and nothing else', () => {
    assert.equal(registry.tags().length, api.length);
    assert.ok(registry.has('pk-card') && registry.has('p') && registry.has('a'));
    for (const t of ['script', 'style', 'iframe', 'form', 'svg', 'pk-nope', 'marquee']) assert.equal(registry.has(t), false, t);
});

test('validation gives the same problems the skills checks give: unknown tag, prop, slot and enum value, numbers, JSON, style', () => {
    const doc = (tag, props = {}, slots = {}) => ({ version: 1, seq: 9, nodes: [{ id: 'n1', tag, props, slots }] });
    assert.deepEqual(errorCodes(validateDoc(doc('pk-card', { heading: 'ok' }), registry)), []);
    assert.deepEqual(errorCodes(validateDoc(doc('pk-nope'), registry)), ['unknown-tag']);
    assert.deepEqual(errorCodes(validateDoc(doc('pk-card', { nope: 'x' }), registry)), ['unknown-prop']);
    assert.deepEqual(errorCodes(validateDoc(doc('pk-card', { tone: 'loud' }), registry)), ['bad-value']);
    assert.match(validateDoc(doc('pk-card', { tone: 'loud' }), registry)[0].message, /is not one of default\|error/);
    assert.deepEqual(errorCodes(validateDoc(doc('pk-card', { level: 'two' }), registry)), ['bad-value']);
    assert.deepEqual(errorCodes(validateDoc(doc('pk-card', { level: '3' }), registry)), []);
    assert.deepEqual(errorCodes(validateDoc(doc('pk-card', { style: 'color:red' }), registry)), ['style-attribute']);
    assert.deepEqual(errorCodes(validateDoc(doc('pk-card', { onclick: 'x()' }), registry)), ['event-attribute']);
    assert.deepEqual(errorCodes(validateDoc(doc('pk-card', { flush: 'yes' }), registry)), ['bad-value']);
    assert.deepEqual(errorCodes(validateDoc(doc('pk-card', { heading: true }), registry)), ['bad-value']);
    assert.deepEqual(errorCodes(validateDoc(doc('pk-card', {}, { nope: [{ id: 'n2', tag: 'p', props: {}, slots: {} }] }), registry)), ['unknown-slot']);
    assert.match(validateDoc(doc('pk-dialog', {}, { sidebar: [{ id: 'n2', tag: 'pk-button', props: {}, slots: {} }] }), registry)[0].message, /has no slot "sidebar"/);
    assert.deepEqual(errorCodes(validateDoc(doc('pk-dialog', { heading: 'x' }, { footer: [{ id: 'n2', tag: 'pk-button', props: {}, slots: { '': ['Ok'] } }] }), registry)), []);
    assert.deepEqual(errorCodes(validateDoc(doc('pk-table', { columns: '[{"key":"a"}]' }, { 'cell-1-a': [{ id: 'n2', tag: 'a', props: { href: '#' }, slots: { '': ['x'] } }] }), registry)), [], 'a slot named per row is allowed');
    assert.deepEqual(errorCodes(validateDoc(doc('pk-table', { columns: '[nope' }), registry)), ['bad-value']);
    assert.deepEqual(errorCodes(validateDoc(doc('p', {}, { footer: [{ id: 'n2', tag: 'span', props: {}, slots: {} }] }), registry)), ['unknown-slot']);
});

test('validation reports structure problems: ids, shape, text in a named slot, limits and unknown fields', () => {
    assert.deepEqual(errorCodes(validateDoc(null, registry)), ['shape']);
    assert.deepEqual(errorCodes(validateDoc({ version: 2, seq: 1, nodes: [] }, registry)), ['version']);
    const dup = { version: 1, seq: 5, nodes: [{ id: 'n1', tag: 'div', props: {}, slots: {} }, { id: 'n1', tag: 'div', props: {}, slots: {} }] };
    assert.deepEqual(errorCodes(validateDoc(dup, registry)), ['id-duplicate']);
    assert.deepEqual(errorCodes(validateDoc({ version: 1, seq: 2, nodes: [{ id: 'n7', tag: 'div', props: {}, slots: {} }] }, registry)), ['id-seq']);
    assert.deepEqual(errorCodes(validateDoc({ version: 1, seq: 2, nodes: [{ id: 'x', tag: 'div', props: {}, slots: {} }] }, registry)), ['id']);
    assert.deepEqual(errorCodes(validateDoc({ version: 1, seq: 3, nodes: [{ id: 'n1', tag: 'pk-card', props: {}, slots: { footer: ['text'] } }] }, registry)), ['text-slot']);
    assert.deepEqual(errorCodes(validateDoc({ version: 1, seq: 3, nodes: [{ id: 'n1', tag: 'div', props: {}, slots: {}, extra: 1 }] }, registry)), ['unknown-field']);
    assert.deepEqual(errorCodes(validateDoc({ version: 1, seq: 3, nodes: [{ id: 'n1', tag: 'div', props: {}, slots: { '': [] } }] }, registry)), ['shape']);
    assert.deepEqual(errorCodes(validateDoc({ version: 1, seq: 4, nodes: [{ id: 'n1', tag: 'p', props: {}, slots: { '': [{ id: 'n2', tag: 'div', props: {}, slots: {} }] } }] }, registry)), ['content-model']);
    assert.deepEqual(errorCodes(validateDoc({ version: 1, seq: 3, nodes: [{ id: 'n1', tag: 'br', props: {}, slots: { '': ['x'] } }] }, registry)), ['void-content']);
    // Text that is not in canonical form is a warning, not an error.
    const sloppy = validateDoc({ version: 1, seq: 3, nodes: [{ id: 'n1', tag: 'p', props: {}, slots: { '': ['  two  spaces '] } }] }, registry);
    assert.deepEqual(codes(sloppy), ['text-form']);
    assert.equal(sloppy[0].severity, 'warn');
    const leaf = validateDoc({ version: 1, seq: 3, nodes: [{ id: 'n1', tag: 'pk-input', props: {}, slots: { '': [{ id: 'n2', tag: 'p', props: {}, slots: {} }] } }] }, registry);
    assert.deepEqual(codes(leaf), ['no-default-slot'], 'a pk-* with no default slot warns about child elements');
    let deep = { id: 'n1', tag: 'div', props: {}, slots: {} };
    for (let i = 2; i < 60; i++) deep = { id: `n${i}`, tag: 'div', props: {}, slots: { '': [deep] } };
    assert.ok(codes(validateDoc({ version: 1, seq: 100, nodes: [deep] }, registry)).includes('too-deep'));
});

test('values are checked: URLs allow http, https, mailto, tel and relative, ids and classes are well formed', () => {
    const at = (tag, props) => errorCodes(validateDoc({ version: 1, seq: 2, nodes: [{ id: 'n1', tag, props, slots: {} }] }, registry));
    for (const ok of ['https://x.test/a?b=1', 'mailto:user@example.com', 'tel:+123', '/relative/path', '#top', 'page.html']) assert.deepEqual(at('a', { href: ok }), [], ok);
    for (const bad of ['' + JS + 'alert(1)', ' JaVa' + 'ScRiPt:x', 'java\tscript:x', 'data:text/html;base64,AAA', 'vbscript:x', 'file:///etc/passwd']) assert.deepEqual(at('a', { href: bad }), ['bad-value'], bad);
    assert.deepEqual(at('img', { src: '' + JS + 'x' }), ['bad-value']);
    assert.deepEqual(at('div', { id: '1bad' }), ['bad-value']);
    assert.deepEqual(at('div', { id: 'ok-1', class: 'a b-c md:w-1/2' }), []);
    assert.deepEqual(at('div', { class: 'a"b' }), ['bad-value']);
    assert.deepEqual(at('div', { 'data-x': 'ok', 'aria-label': 'ok', role: 'note' }), []);
    assert.deepEqual(at('div', { 'data-lb-id': 'n1' }), ['unknown-prop'], 'the builder\'s own attribute is not a prop');
    assert.deepEqual(at('div', { srcdoc: 'x' }), ['unknown-prop']);
});

// ---------------------------------------------------------------- HTML out and in

test('toHtml writes escaped, double-quoted, indented markup and a compact one-line form', () => {
    const { doc } = doc0();
    assert.equal(toHtml(doc, { compact: true }), '<pk-card heading="Hi" tone="error"><p>Body text</p><pk-button slot="footer" variant="primary" disabled>Save</pk-button></pk-card>');
    assert.equal(toHtml(doc), '<pk-card heading="Hi" tone="error">\n  <p>Body text</p>\n  <pk-button slot="footer" variant="primary" disabled>Save</pk-button>\n</pk-card>');
    const ids = toHtml(doc, { ids: true, compact: true });
    assert.match(ids, /<pk-card data-lb-id="n1" heading="Hi"/);
    const { doc: tricky } = insertNode(emptyDoc(), { node: { tag: 'p', props: { title: 'a "q" & <b>' }, text: 'x < y & z > w' } }, registry);
    assert.equal(toHtml(tricky), '<p title="a &quot;q&quot; &amp; &lt;b&gt;">x &lt; y &amp; z &gt; w</p>');
});

test('fromHtml reads what toHtml writes, keeps text spaces around inline elements and normalises hand-written markup', () => {
    const src = `
        <!-- a comment -->
        <pk-card   heading='Hi'>
            <p>Hello   <b>brave</b>
               new world</p>
            <pk-button slot="footer" disabled>Save</pk-button>
        </pk-card>`;
    const { doc, problems } = fromHtml(src, { registry });
    assert.deepEqual(problems, []);
    assert.equal(toHtml(doc, { compact: true }), '<pk-card heading="Hi"><p>Hello <b>brave</b> new world</p><pk-button slot="footer" disabled>Save</pk-button></pk-card>');
    assert.deepEqual(doc.nodes[0].slots[''][0].slots[''], ['Hello ', doc.nodes[0].slots[''][0].slots[''][1], ' new world']);
    assert.deepEqual(validateDoc(doc, registry), []);
    assert.equal(doc.seq, 5);
    assert.equal(fromHtml('<pk-button disabled="false">x</pk-button>', { registry }).doc.nodes[0].props.disabled, true, 'a boolean attribute is present or absent');
    assert.equal(fromHtml('<pk-input value>x</pk-input>', { registry }).doc.nodes[0].props.value, '', 'a valueless string attribute is empty');
    assert.equal(fromHtml('<p>a &amp; b &lt;c&gt; &#65;&#x42; &copy;</p>', { registry }).doc.nodes[0].slots[''][0], 'a & b <c> AB ©');
});

test('preformatted text and code blocks keep their whitespace, and the optional end tags of lists and tables close', () => {
    const src = '<pk-code-block label="x">line 1\n  line 2\n</pk-code-block><pre>a   b\n c</pre><ul><li>one<li>two</ul><table><tr><td>a<td>b<tr><td>c</table>';
    const { doc, problems } = fromHtml(src, { registry });
    assert.deepEqual(errorsOf(problems), []);
    assert.equal(doc.nodes[0].slots[''][0], 'line 1\n  line 2\n');
    assert.equal(doc.nodes[1].slots[''][0], 'a   b\n c');
    assert.equal(doc.nodes[2].slots[''].length, 2);
    assert.equal(doc.nodes[3].slots[''].length, 2);
    assert.equal(equalDocs(fromHtml(toHtml(doc), { registry }).doc, doc), true);
});

test('JSON round trip and HTML round trip hold on random trees, and HTML output is a fixed point', () => {
    for (const seed of SEEDS) {
        const doc = randomDoc(seed);
        assert.deepEqual(errorCodes(validateDoc(doc, registry)), [], `seed ${seed}: the generator must build valid documents`);
        assert.deepEqual(codes(validateDoc(doc, registry)).filter(c => c === 'text-form'), [], `seed ${seed}: canonical text`);
        const { doc: viaJson, problems: jp } = fromJson(toJson(doc), { registry });
        assert.deepEqual(jp.filter(p => p.severity === 'error'), [], `seed ${seed}`);
        assert.deepEqual(viaJson, doc, `seed ${seed}: model -> json -> model`);
        for (const compact of [false, true]) {
            const html = toHtml(doc, { compact });
            const { doc: back, problems } = fromHtml(html, { registry });
            assert.deepEqual(errorsOf(problems), [], `seed ${seed}: ${html.slice(0, 200)}`);
            assert.deepEqual(stripIds(back), stripIds(doc), `seed ${seed} compact=${compact}: model -> html -> model`);
            assert.equal(toHtml(back, { compact }), html, `seed ${seed}: html -> model -> html is a fixed point`);
        }
        const withIds = toHtml(doc, { ids: true });
        const { doc: idBack } = fromHtml(withIds, { registry, ids: true });
        assert.equal(equalDocs(idBack, doc, { ids: true }), true, `seed ${seed}: ids survive with ids: true`);
        assert.ok(!/data-lb-id/.test(toHtml(doc)), 'no ids in the exported markup');
    }
});

test('every SDK element example and pattern sample loads as a valid document, and its markup is a fixed point', () => {
    const sources = [];
    for (const e of api) for (const ex of e.examples ?? []) sources.push([`${e.tag}: ${ex.title}`, ex.html]);
    const patterns = path.join(root, 'samples', 'patterns');
    for (const d of fs.readdirSync(patterns)) for (const f of fs.readdirSync(path.join(patterns, d)).filter(x => x.endsWith('.html'))) sources.push([`${d}/${f}`, fs.readFileSync(path.join(patterns, d, f), 'utf8')]);
    assert.ok(sources.length > 100);
    const failures = [];
    for (const [name, html] of sources) {
        const { doc, problems } = fromHtml(html, { registry });
        // Only <form> and <svg> (icons are pk-icon) are outside the model on purpose.
        const bad = errorsOf(problems).filter(p => !(p.code === 'forbidden-tag' && /<(form|svg)>/.test(p.message)));
        if (bad.length) failures.push(`${name}: ${bad.map(p => p.message).join('; ')}`);
        if (errorsOf(validateDoc(doc, registry)).length) failures.push(`${name}: the loaded document is invalid`);
        const once = toHtml(doc);
        if (toHtml(fromHtml(once, { registry }).doc) !== once) failures.push(`${name}: not a fixed point`);
    }
    assert.deepEqual(failures, []);
});

// ---------------------------------------------------------------- hostile input

test('hostile markup is refused, never kept: scripts, styles, handlers, javascript URLs, unknown tags, srcdoc and friends', () => {
    const hostile = [
        '<script>alert(1)</script>', '<SCRIPT SRC=x></SCRIPT>', '<style>*{x:y}</style>', '<iframe src="https://x.test"></iframe>', '<iframe srcdoc="<script>1</script>"></iframe>',
        '<object data="x"></object>', '<embed src="x">', '<link rel="stylesheet" href="x">', '<meta http-equiv="refresh" content="0;url=x">', '<base href="//evil.test/">',
        '<svg onload="x"><script>1</script></svg>', '<math><mi xlink:href="' + JS + 'x">1</mi></math>', '<form action="x"><input></form>', '<template><script>1</script></template>',
        '<img src=x onerror=alert(1)>', '<a href="' + JS + 'alert(1)">x</a>', '<a href="JaVa&#x09;Script:alert(1)">x</a>', '<a href=" &#106;avascript:alert(1)">x</a>', '<div style="background:url(x)">x</div>',
        '<div onclick="x()" onmouseover=x>x</div>', '<pk-button onclick="x">x</pk-button>', '<pk-nope>x</pk-nope>', '<marquee>x</marquee>', '<p slot="x">x</p>',
        '<textarea><script>1</script></textarea>', '<noscript><img src=x onerror=1></noscript>', '<title><script>1</script></title>', '<xmp><script>1</script></xmp>',
        '<div><![CDATA[<script>1</script>]]></div>', '<!--<script>1</script>-->', '<a href="data:text/html,<script>1</script>">x</a>', '<pk-card tone="<script>">x</pk-card>',
        '<pk-card heading="a" heading="b">x</pk-card>', '<div data-lb-id="n1" srcdoc="x">x</div>', '<img src="//evil.test/x" srcset="' + JS + 'x">',
    ];
    for (const html of hostile) {
        const { doc, problems } = fromHtml(html, { registry });
        const out = toHtml(doc);
        assert.deepEqual(errorsOf(validateDoc(doc, registry)), [], html);
        assert.ok(!/<script|<style|<iframe|<object|<embed|<link|<meta|<base|<form|<svg|<math|<template|<textarea|<noscript|<title|<marquee|\son\w+=|style=|srcdoc|java[s]cript:|data:text|vbscript:/i.test(out), `${html} -> ${out}`);
        assert.ok(problems.length > 0 || out === '' || /^</.test(out), html);
    }
    assert.ok(codes(fromHtml('<script>alert(1)</script>', { registry }).problems).includes('forbidden-tag'));
    assert.deepEqual(fromHtml('<script>alert(1)</script>', { registry }).doc.nodes, []);
    assert.equal(toHtml(fromHtml('<div onclick="x()">ok</div>', { registry }).doc), '<div>ok</div>');
    assert.equal(toHtml(fromHtml('<p>a<script>evil()</script>b</p>', { registry }).doc), '<p>ab</p>');
    assert.equal(toHtml(fromHtml('<pk-card tone="loud" heading="ok">x</pk-card>', { registry }).doc), '<pk-card heading="ok">x</pk-card>');
    const slotted = fromHtml('<pk-card><p slot="nope">x</p><p>kept</p></pk-card>', { registry });
    assert.equal(toHtml(slotted.doc, { compact: true }), '<pk-card><p>kept</p></pk-card>');
    assert.ok(codes(slotted.problems).includes('unknown-slot'));
});

test('malformed and oversized input never throws and always gives a valid document', () => {
    const rnd = prng(7);
    const junk = ['<', '>', '</', '<a', '<a ', '<a href="', "<a href='x", '<!--', '<!', '<?', '&', '&#', '&#xZZ;', '&#0;', '&#1114112;', '&#55296;', '&bogus;', '<p>', '</p>', '</div>', '<pk-card>', '<pk-card', 'text', ' ', '\n', '\x00', '"', "'", '=', '/', '<br/>', '<img>', '<div/>', '<pk-button slot=', '<li>', '<td>', '<option>'];
    for (let i = 0; i < 400; i++) {
        let s = '';
        for (let k = 0, n = 1 + Math.floor(rnd() * 12); k < n; k++) s += junk[Math.floor(rnd() * junk.length)];
        const { doc } = fromHtml(s, { registry });
        assert.deepEqual(errorsOf(validateDoc(doc, registry)), [], JSON.stringify(s));
        const again = toHtml(doc);
        assert.equal(toHtml(fromHtml(again, { registry }).doc), again, `fixed point for ${JSON.stringify(s)}`);
    }
    for (const bad of [undefined, null, 5, {}, []]) assert.deepEqual(fromHtml(bad, { registry }).doc.nodes, []);
    assert.throws(() => fromHtml('x'), TypeError);
    const deep = '<div>'.repeat(LIMITS.depth + 5) + 'x' + '</div>'.repeat(LIMITS.depth + 5);
    const r = fromHtml(deep, { registry });
    assert.deepEqual(errorsOf(validateDoc(r.doc, registry)), []);
    assert.ok(codes(r.problems).some(c => c === 'too-deep'));
    const wide = fromHtml('<p>x</p>'.repeat(LIMITS.nodes + 50), { registry });
    assert.ok(wide.doc.nodes.length <= LIMITS.nodes && codes(wide.problems).includes('too-many-nodes'));
    assert.ok(codes(fromHtml('x'.repeat(LIMITS.input + 1), { registry }).problems).includes('too-large'));
});

test('hostile JSON is refused: prototype keys, wrong shapes, unknown fields, a script tag', () => {
    const bad = [
        '{', 'null', '[]', '{"version":1,"seq":2,"nodes":[{"id":"n1","tag":"script","props":{},"slots":{}}]}',
        '{"version":1,"seq":2,"nodes":[{"id":"n1","tag":"div","props":{"__proto__":"x"},"slots":{}}]}',
        '{"version":1,"seq":2,"nodes":[{"id":"n1","tag":"div","props":{"onclick":"x"},"slots":{}}]}',
        '{"version":1,"seq":2,"nodes":[{"id":"n1","tag":"div","props":{},"slots":{"__proto__":["x"]}}]}',
        '{"version":1,"seq":2,"nodes":[{"id":"n1","tag":"div","props":[],"slots":{}}]}',
        '{"version":1,"seq":2,"nodes":[{"id":"n1","tag":"div","props":{"style":"x"},"slots":{}}]}',
        '{"version":1,"seq":2,"nodes":"x"}', '{"version":1,"seq":2,"nodes":[7]}', '{"version":1,"seq":2,"nodes":[{"id":"n1","tag":"div","props":{},"slots":{"":[7]}}]}',
    ];
    for (const text of bad) {
        const { doc, problems } = fromJson(text, { registry });
        assert.equal(doc, null, text);
        assert.ok(problems.length > 0, text);
    }
    assert.equal(fromJson(toJson(emptyDoc()), { registry }).doc.nodes.length, 0);
    assert.equal(({}).polluted, undefined);
});

// ---------------------------------------------------------------- operations

test('insert puts a node at an index in a slot, gives it a stable id and leaves the old document untouched', () => {
    const { doc, card } = doc0();
    const frozen = JSON.stringify(doc);
    const r = insertNode(doc, { parent: card, index: 0, node: { tag: 'h2', text: 'Title' } }, registry);
    assert.equal(JSON.stringify(doc), frozen, 'the original is untouched');
    assert.equal(r.doc.nodes[0].slots[''][0].tag, 'h2');
    assert.equal(r.id, `n${doc.seq}`);
    assert.equal(r.doc.seq, doc.seq + 1);
    assert.equal(findNode(r.doc, card).id, card, 'ids of untouched nodes stay');
    assert.throws(() => insertNode(doc, { parent: card, slot: 'nope', node: { tag: 'p' } }, registry), e => e instanceof ModelError && e.code === 'invalid');
    assert.throws(() => insertNode(doc, { parent: card, node: { tag: 'script' } }, registry), e => e.code === 'invalid' && /not allowed/.test(e.message));
    assert.throws(() => insertNode(doc, { parent: 'n99', node: { tag: 'p' } }, registry), e => e.code === 'not-found');
    assert.throws(() => insertNode(doc, { parent: card, index: 9, node: { tag: 'p' } }, registry), e => e.code === 'bad-index');
    assert.throws(() => insertNode(doc, { slot: 'footer', node: { tag: 'p' } }, registry), e => e.code === 'invalid', 'a top-level node has no slot');
    assert.throws(() => insertNode(doc, { parent: findNode(doc, card).slots[''][0].id, node: { tag: 'p' }, slot: 'x' }, registry));
    const noRegistry = insertNode(doc, { node: { tag: 'anything' } });
    assert.equal(noRegistry.doc.nodes.length, 2, 'without a registry only the structure is checked');
});

test('move reorders among siblings and across parents and slots, refuses a move into itself, and keeps ids', () => {
    let { doc, card } = doc0();
    const [p, btn] = [findNode(doc, card).slots[''][0].id, findNode(doc, card).slots.footer[0].id];
    ({ doc } = insertNode(doc, { node: { tag: 'section' } }, registry));
    const section = doc.nodes[1].id;
    const r = moveNode(doc, { id: p, parent: section, index: 0 }, registry);
    assert.equal(findNode(r.doc, section).slots[''][0].id, p);
    assert.equal(findNode(r.doc, card).slots[''], undefined, 'an emptied slot is left out');
    const r2 = moveNode(r.doc, { id: btn, parent: section, index: 1 }, registry);
    assert.deepEqual(findNode(r2.doc, section).slots[''].map(n => n.id), [p, btn]);
    assert.deepEqual(findNode(r2.doc, section).slots[''].map(n => n.id), [p, btn]);
    const reorder = moveNode(r2.doc, { id: p, parent: section, index: 1 }, registry);
    assert.deepEqual(findNode(reorder.doc, section).slots[''].map(n => n.id), [btn, p]);
    assert.throws(() => moveNode(doc, { id: card, parent: card }), e => e.code === 'cycle');
    assert.throws(() => moveNode(doc, { id: card, parent: p }), e => e.code === 'cycle');
    assert.throws(() => moveNode(doc, { id: p, parent: card, slot: 'nope' }, registry), e => e.code === 'invalid');
    const top = moveNode(r2.doc, { id: btn, parent: null, index: 0 }, registry);
    assert.equal(top.doc.nodes[0].id, btn);
    assert.equal(flatten(top.doc).length, flatten(doc).length, 'nothing is lost or duplicated');
    assert.deepEqual(errorCodes(validateDoc(top.doc, registry)), []);
});

test('remove, duplicate, wrap, setProp, setText and setSlot', () => {
    const { doc, card } = doc0();
    const p = findNode(doc, card).slots[''][0].id;
    const btn = findNode(doc, card).slots.footer[0].id;
    assert.equal(flatten(removeNode(doc, { id: card }).doc).length, 0);
    assert.throws(() => removeNode(doc, { id: 'n404' }), e => e.code === 'not-found');

    const dup = duplicateNode(doc, { id: card });
    assert.equal(dup.doc.nodes.length, 2);
    assert.deepEqual(stripIds({ ...dup.doc, nodes: [dup.doc.nodes[0]] }), stripIds({ ...dup.doc, nodes: [dup.doc.nodes[1]] }));
    const ids = flatten(dup.doc).map(n => n.id);
    assert.equal(new Set(ids).size, ids.length, 'a copy gets fresh ids');
    assert.equal(dup.doc.nodes[1].id, dup.id);
    assert.deepEqual(errorCodes(validateDoc(dup.doc, registry)), []);

    const wrapped = wrapNode(doc, { id: btn, wrapper: 'pk-cluster' }, registry);
    const footer = findNode(wrapped.doc, card).slots.footer;
    assert.equal(footer.length, 1, 'the wrapper takes the slot');
    assert.equal(footer[0].tag, 'pk-cluster');
    assert.equal(footer[0].slots[''][0].id, btn);
    assert.deepEqual(errorCodes(validateDoc(wrapped.doc, registry)), []);
    assert.equal(wrapNode(doc, { id: card, wrapper: { tag: 'pk-stack', props: { gap: 'sm' } } }, registry).doc.nodes[0].tag, 'pk-stack');
    assert.throws(() => wrapNode(doc, { id: btn, wrapper: 'pk-nope' }, registry), e => e.code === 'invalid');

    assert.equal(findNode(setProp(doc, { id: card, name: 'heading', value: 'New' }, registry).doc, card).props.heading, 'New');
    assert.equal(findNode(setProp(doc, { id: card, name: 'level', value: 3 }, registry).doc, card).props.level, '3', 'a number becomes its text');
    assert.equal('tone' in findNode(setProp(doc, { id: card, name: 'tone', value: undefined }, registry).doc, card).props, false, 'undefined removes');
    assert.equal('disabled' in findNode(setProp(doc, { id: btn, name: 'disabled', value: false }, registry).doc, btn).props, false, 'false removes a boolean');
    for (const [name, value] of [['tone', 'loud'], ['nope', 'x'], ['style', 'x'], ['onclick', 'x'], ['flush', 'text'], ['slot', 'x']]) assert.throws(() => setProp(doc, { id: card, name, value }, registry), e => e.code === 'invalid', name);
    assert.throws(() => setProp(doc, { id: 'n404', name: 'heading', value: 'x' }), e => e.code === 'not-found');

    assert.deepEqual(findNode(setText(doc, { id: p, text: '  Hello \n  there  ' }).doc, p).slots[''], ['Hello there']);
    assert.equal(findNode(setText(doc, { id: p, text: '   ' }).doc, p).slots[''], undefined, 'empty text removes it');
    const mixed = insertNode(doc, { parent: p, node: { tag: 'b', text: 'x' } }, registry).doc;
    assert.deepEqual(findNode(setText(mixed, { id: p, text: 'New' }).doc, p).slots[''].map(c => (typeof c === 'string' ? c : c.tag)), ['New', 'b'], 'element children stay');
    assert.throws(() => setText(insertNode(doc, { node: { tag: 'br' } }, registry).doc, { id: `n${doc.seq}`, text: 'x' }), e => e.code === 'void-content');

    const withSlot = setSlot(doc, { id: p, slot: 'footer' }, registry);
    assert.deepEqual(findNode(withSlot.doc, card).slots.footer.map(n => n.id), [btn, p]);
    assert.throws(() => setSlot(doc, { id: p, slot: 'nope' }, registry), e => e.code === 'invalid');
    assert.throws(() => setSlot(doc, { id: card, slot: 'footer' }, registry), e => e.code === 'slot-parent');
    assert.equal(locate(doc, btn).slot, 'footer');
});

test('random edit sequences keep the document valid and the ids unique', () => {
    for (const seed of SEEDS.slice(0, 20)) {
        const rnd = prng(seed);
        let doc = randomDoc(seed, 15);
        for (let i = 0; i < 40; i++) {
            const nodes = flatten(doc);
            if (!nodes.length) break;
            const a = nodes[Math.floor(rnd() * nodes.length)];
            const b = nodes[Math.floor(rnd() * nodes.length)];
            try {
                const op = Math.floor(rnd() * 5);
                if (op === 0) doc = moveNode(doc, { id: a.id, parent: b.id }, registry).doc;
                else if (op === 1) doc = removeNode(doc, { id: a.id }).doc;
                else if (op === 2) doc = duplicateNode(doc, { id: a.id }).doc;
                else if (op === 3) doc = wrapNode(doc, { id: a.id, wrapper: 'div' }, registry).doc;
                else doc = setText(doc, { id: a.id, text: `t${i}` }).doc;
            } catch (error) {
                assert.ok(error instanceof ModelError, `only model errors: ${error}`);
            }
            const problems = errorsOf(validateDoc(doc, registry));
            assert.deepEqual(problems, [], `seed ${seed} step ${i}`);
        }
        const ids = flatten(doc).map(n => n.id);
        assert.equal(new Set(ids).size, ids.length);
    }
});

test('normalizeText collapses whitespace and trims', () => {
    assert.equal(normalizeText('  a \n\t b  '), 'a b');
    assert.equal(normalizeText(null), '');
});

// ---------------------------------------------------------------- history

test('history undoes and redoes, drops the redo branch on a new edit, coalesces a keyed run and caps its size', () => {
    let { doc, card } = doc0();
    const h = createHistory(doc, { limit: 3 });
    assert.equal(h.canUndo, false);
    const a = setProp(h.doc, { id: card, name: 'heading', value: 'A' }, registry).doc;
    const b = setProp(a, { id: card, name: 'heading', value: 'AB' }, registry).doc;
    h.push(a, 'prop:heading'); h.push(b, 'prop:heading');
    assert.equal(h.size, 1, 'the same key in a row is one step');
    assert.equal(h.doc, b);
    assert.equal(findNode(h.undo(), card).props.heading, 'Hi', 'one undo reverts the whole run');
    assert.equal(h.canRedo, true);
    assert.equal(h.redo(), b);
    h.undo();
    const c = setProp(h.doc, { id: card, name: 'tone', value: 'default' }, registry).doc;
    h.push(c);
    assert.equal(h.canRedo, false, 'a new edit drops the redo branch');
    assert.equal(h.push(c), c, 'pushing the same document is not a step');
    assert.equal(h.size, 1);
    for (let i = 0; i < 6; i++) h.push(setProp(h.doc, { id: card, name: 'heading', value: `v${i}` }, registry).doc);
    assert.equal(h.size, 3, 'the stack is capped');
    h.reset(doc);
    assert.equal(h.canUndo || h.canRedo, false);
    assert.equal(h.undo(), doc, 'undo on an empty stack changes nothing');
});
