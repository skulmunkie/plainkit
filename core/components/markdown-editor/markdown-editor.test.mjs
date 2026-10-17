// pk-markdown-editor: the pure helpers, the API, and the rule that the Markdown parser and renderer are a lazy chunk, never a static import of the shell. The behaviour is
// in core/tests/browser/cases-markdown-editor.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { parseToolbar, diffRange, COMMANDS, DEFAULT_TOOLBAR } from './markdown-editor.js';

const read = f => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
const src = read('./markdown-editor.js'), meta = JSON.parse(read('./markdown-editor.meta.json')), css = read('./markdown-editor.css');

test('parseToolbar keeps known commands in order, once each', () => {
    assert.deepEqual(parseToolbar(DEFAULT_TOOLBAR), ['bold', 'italic', 'heading', 'quote', 'code', 'ul', 'ol', 'link']);
    assert.deepEqual(parseToolbar('link  bold nope bold'), ['link', 'bold']);
    assert.deepEqual(parseToolbar(''), []);
    assert.ok(Object.values(COMMANDS).every(c => c.label));
});

test('diffRange is the smallest replacement between two texts', () => {
    assert.deepEqual(diffRange('a word here', 'a **word** here'), [2, 6, '**word**']);
    assert.deepEqual(diffRange('abc', 'abc'), [3, 3, '']);
    assert.deepEqual(diffRange('**x**', 'x'), [0, 5, 'x']);
    for (const [a, b] of [['aaa', 'aa'], ['', 'xy'], ['abab', 'ab'], ['one\ntwo', '- one\n- two']]) {
        const [from, to, ins] = diffRange(a, b);
        assert.equal(a.slice(0, from) + ins + a.slice(to), b);
    }
});

test('the shell imports the Markdown modules only lazily', () => {
    const code = src.replace(/\/\/.*$/gm, '');
    assert.ok(!/^\s*import[^(\n]*markdown/m.test(code), 'no static import of js/markdown');
    assert.match(code, /import\('\.\.\/\.\.\/js\/markdown\/render\.js'\)/);
    assert.match(code, /import\('\.\.\/\.\.\/js\/markdown\/commands\.js'\)/);
    assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(code), 'no string-to-HTML sink');
});

test('the API: a form-associated component with the documented props and the pk-change commit', () => {
    assert.equal(meta.tier, 'component'); assert.equal(meta.formAssociated, true);
    assert.deepEqual(meta.props.map(p => p.name), ['name', 'value', 'placeholder', 'label', 'description', 'disabled', 'readonly', 'required', 'maxlength', 'rows', 'mode', 'layout', 'toolbar']);
    assert.equal(meta.props.find(p => p.name === 'value').commit, 'pk-change');
    assert.ok(meta.events.some(e => e.name === 'pk-change'));
});

test('tokens only', () => assert.doesNotMatch(css.replace(/var\([^)]*\)/g, ''), /#[0-9a-f]{3,8}\b|rgba?\(/i));

test('size: the shell and the lazy chunk stay inside their recorded gzip caps', () => {
    const dist = '../../dist/';
    if (!fs.existsSync(new URL(dist + 'elements/markdown-editor.js', import.meta.url))) return; // run the bootstrap first; the budget test covers the shell
    const gz = f => zlib.gzipSync(fs.readFileSync(new URL(f, import.meta.url))).length;
    const chunk = ['parse', 'render', 'commands'].reduce((n, f) => n + gz(`${dist}js/markdown/${f}.js`), 0);
    assert.ok(gz(dist + 'elements/markdown-editor.js') <= 4400, 'shell over 4.3 KB gzip: move code into the lazy chunk');
    assert.ok(chunk <= 3000, `lazy chunk ${chunk} bytes gzip, cap 3000`);
});
