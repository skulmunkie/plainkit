// Unit tests for the CSS tokenizer (core/tools/strict/scanners/css.mjs, #605).
import test from 'node:test';
import assert from 'node:assert/strict';
import { scanCss } from '../tools/strict/scanners/css.mjs';

test('a simple rule is parsed into a name and declarations', () => {
    const { nodes } = scanCss('.card { color: red; padding: 4px; }');
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].kind, 'rule');
    assert.equal(nodes[0].name, '.card');
    assert.deepEqual(nodes[0].declarations.map(d => [d.property, d.value]), [['color', 'red'], ['padding', '4px']]);
});

test('comments are stripped and never appear in a selector or value', () => {
    const { nodes } = scanCss('/* note */ .a /* mid */ { color: /* red? */ blue; }');
    assert.equal(nodes[0].name, '.a');
    assert.equal(nodes[0].declarations[0].value, 'blue');
});

test('a string value keeps braces and semicolons from splitting it', () => {
    const { nodes } = scanCss('.a { content: "a; b { c }"; }');
    assert.equal(nodes[0].declarations.length, 1);
    assert.equal(nodes[0].declarations[0].value, '"a; b { c }"');
});

test('@media recurses so its inner rule is a normal rule node', () => {
    const { nodes } = scanCss('@media (min-width: 768px) { .a { color: red; } }');
    assert.equal(nodes[0].kind, 'at-rule');
    assert.ok(nodes[0].name.startsWith('@media'));
    const inner = nodes.find(n => n.kind === 'rule');
    assert.equal(inner.name, '.a');
});

test('@layer and @supports also recurse', () => {
    const { nodes } = scanCss('@layer base { .a { color: red; } } @supports (gap: 1px) { .b { color: blue; } }');
    const rules = nodes.filter(n => n.kind === 'rule').map(n => n.name);
    assert.deepEqual(rules, ['.a', '.b']);
});

test('@import and other body-less at-rules are single nodes', () => {
    const { nodes } = scanCss('@import "tokens.css"; .a { color: red; }');
    assert.equal(nodes[0].kind, 'at-rule');
    assert.ok(nodes[0].name.startsWith('@import'));
});

test('a declaration with a function value keeps its parens intact', () => {
    const { nodes } = scanCss('.a { color: var(--color-fg, #000); }');
    assert.equal(nodes[0].declarations[0].value, 'var(--color-fg, #000)');
});

test('nested rules (e.g. @media inside @layer) parse two levels deep', () => {
    const { nodes } = scanCss('@layer base { @media (min-width: 768px) { .a { color: red; } } }');
    const inner = nodes.find(n => n.kind === 'rule');
    assert.equal(inner.name, '.a');
});

test('line numbers point at the selector, not the file start', () => {
    const { nodes } = scanCss('.a { color: red; }\n.b { color: blue; }');
    const b = nodes.find(n => n.name === '.b');
    assert.equal(b.line, 2);
});
