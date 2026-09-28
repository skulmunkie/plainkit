// Unit tests for the JS/TS/JSX tokenizer (core/tools/strict/scanners/js.mjs, #605).
import test from 'node:test';
import assert from 'node:assert/strict';
import { scanJs } from '../tools/strict/scanners/js.mjs';

const kinds = (text) => scanJs(text).tokens.filter(t => t.kind !== 'comment' && t.kind !== 'punct').map(t => t.kind);

test('tokenizes strings, numbers and identifiers', () => {
    const { tokens } = scanJs('const x = 1;\nconst s = "hi";');
    assert.deepEqual(tokens.filter(t => t.kind === 'string').map(t => t.value), ['hi']);
    assert.deepEqual(tokens.filter(t => t.kind === 'number').map(t => t.value), ['1']);
    assert.ok(tokens.some(t => t.kind === 'identifier' && t.value === 'x'));
});

test('a line comment does not swallow the next line', () => {
    const { tokens } = scanJs('// nope\nconst x = 1;');
    assert.ok(tokens.some(t => t.kind === 'identifier' && t.value === 'x'));
});

test('a block comment is one token, code after it still scans', () => {
    const { tokens } = scanJs('/* skip\nthis */ const x = 2;');
    assert.equal(tokens.filter(t => t.kind === 'comment').length, 1);
    assert.ok(tokens.some(t => t.kind === 'number' && t.value === '2'));
});

test('a template literal with an interpolation keeps its full text as one token', () => {
    const { tokens } = scanJs('const s = `a${1 + 2}b`;');
    const tmpl = tokens.find(t => t.kind === 'template');
    assert.equal(tmpl.value, '`a${1 + 2}b`');
});

test('a nested template literal inside an interpolation does not break tokenizing', () => {
    const { tokens } = scanJs('const s = `outer${`inner${1}`}end`; const n = 5;');
    assert.ok(tokens.some(t => t.kind === 'number' && t.value === '5'));
});

test('a regex literal after "return" is a regex, not division', () => {
    const { tokens } = scanJs('function f() { return /ab+c/i.test(x); }');
    const regex = tokens.find(t => t.kind === 'regex');
    assert.equal(regex.value, '/ab+c/i');
});

test('a slash after an identifier is division, not a regex', () => {
    const { tokens } = scanJs('const r = a / b;');
    assert.equal(tokens.some(t => t.kind === 'regex'), false);
});

test('a regex with an escaped slash and a character class does not end early', () => {
    const { tokens } = scanJs('const re = /a\\/[a/]b/g;');
    const regex = tokens.find(t => t.kind === 'regex');
    assert.equal(regex.value, '/a\\/[a/]b/g');
});

test('a JSX open tag is re-scanned as markup and reported separately from JS tokens', () => {
    const { jsx } = scanJs('function App() { return <PkButton label="Save" />; }');
    assert.equal(jsx.length, 1);
    assert.equal(jsx[0].kind, 'component');
    assert.equal(jsx[0].name, 'PkButton');
    assert.deepEqual(jsx[0].attrs, { label: 'Save' });
});

test('a lowercase JSX tag is reported with kind "tag"', () => {
    const { jsx } = scanJs('const el = <div className="a">hi</div>;');
    assert.equal(jsx[0].kind, 'tag');
    assert.equal(jsx[0].name, 'div');
});

test('a less-than comparison after an identifier is not treated as JSX', () => {
    const { jsx, tokens } = scanJs('if (a < b) { c(); }');
    assert.equal(jsx.length, 0);
    assert.ok(tokens.some(t => t.kind === 'identifier' && t.value === 'b'));
});

test('line numbers advance correctly for tokens after a multi-line template', () => {
    const { tokens } = scanJs('const s = `line1\nline2`;\nconst y = 9;');
    const y = tokens.find(t => t.kind === 'number' && t.value === '9');
    assert.equal(y.line, 3);
});
