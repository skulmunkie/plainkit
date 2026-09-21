// The breakpoint analysis (tools/breakpoint-report.mjs): parsing, attribution to named breakpoints, and the report the build writes to dist/.
import './needs-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseBreakpoints } from '../tools/breakpoints.mjs';
import { splitRules, propertyNames, classifyCondition, mediaRules, buildReport, formatTable } from '../tools/breakpoint-report.mjs';

const core = fileURLToPath(new URL('..', import.meta.url));
const bps = parseBreakpoints({ phone: 640, tablet: 1024, wide: 1280 });

test('splitRules returns the top-level blocks, ignores comments and at-rules without a block, and refuses unbalanced braces', () => {
    const rules = splitRules('/* { */ @import url("a.css"); .a { color: red; } @media (max-width: 640px) { .b { top: 0; } }');
    assert.deepEqual(rules.map(r => r.prelude), ['.a', '@media (max-width: 640px)']);
    assert.throws(() => splitRules('.a { color: red; } }'), /unbalanced "\}"/);
    assert.throws(() => splitRules('.a { color: red;'), /unbalanced "\{"/);
});

test('propertyNames lists this rule\'s declarations (custom properties too), not the nested blocks', () => {
    assert.deepEqual(propertyNames(' color: red; --_c: 1px; margin: 0; .x { padding: 0; } '), ['color', '--_c', 'margin']);
});

test('classifyCondition: max-width is "below", the complement min-width is "above", other widths are unnamed, other features are context', () => {
    assert.deepEqual(classifyCondition('(max-width: 640px)', bps), { named: [{ breakpoint: 'phone', direction: 'below', alsoWhen: '' }], unnamed: [] });
    assert.deepEqual(classifyCondition('(min-width: 641px)', bps).named, [{ breakpoint: 'phone', direction: 'above', alsoWhen: '' }]);
    assert.deepEqual(classifyCondition('(min-width: 1025px) and (max-width: 1280px)', bps).named.map(n => `${n.direction} ${n.breakpoint}`), ['above tablet', 'below wide']);
    assert.deepEqual(classifyCondition('(max-width: 700px)', bps), { named: [], unnamed: [{ width: 700, direction: 'below' }] });
    assert.deepEqual(classifyCondition('(pointer: coarse), (max-width: 640px)', bps).named, [{ breakpoint: 'phone', direction: 'below', alsoWhen: '(pointer: coarse)' }]);
    assert.deepEqual(classifyCondition('(max-width: 640px) and (orientation: portrait)', bps).named[0].alsoWhen, '(orientation: portrait)');
    assert.deepEqual(classifyCondition('(prefers-reduced-motion: reduce)', bps), { named: [], unnamed: [] });
});

test('mediaRules finds the rules inside @media, also nested in @supports and in a list of selectors, and skips keyframes', () => {
    const css = `.a { top: 0; }
@media (max-width: 640px) { .b, .c { color: red; margin: 0; } @supports (display: grid) { .d { display: grid; } } }
@keyframes k { from { top: 0; } to { top: 1px; } }
@media (prefers-reduced-motion: reduce) { .e { animation: none; } }`;
    const found = mediaRules(css);
    assert.deepEqual(found.map(f => [f.selector, f.properties.join(' ')]), [['.b, .c', 'color margin'], ['.d', 'display'], ['.e', 'animation']]);
    assert.deepEqual(found[0].conds, ['(max-width: 640px)']);
});

test('buildReport gives, per breakpoint, the elements and the properties that change, and lists a stray width as unnamed', () => {
    const report = buildReport([
        { name: 'alpha', css: '@media (max-width: 640px) { .a { min-height: 44px; } .b { display: none; } } @media (min-width: 641px) { .a { min-height: 28px; } }' },
        { name: 'beta', css: '@media (pointer: coarse), (max-width: 640px) { .x { font-size: 16px; } } @media (max-width: 1024px) { :host { position: fixed; } } @media (max-width: 700px) { .z { top: 0; } }' },
        { name: 'plain', css: '.a { top: 0; } @media (prefers-reduced-motion: reduce) { .a { transition: none; } }' },
    ], bps);
    assert.deepEqual(report.byBreakpoint.phone.elements.alpha.below, [{ selector: '.a', properties: ['min-height'] }, { selector: '.b', properties: ['display'] }]);
    assert.deepEqual(report.byBreakpoint.phone.elements.alpha.above, [{ selector: '.a', properties: ['min-height'] }]);
    assert.deepEqual(report.byBreakpoint.phone.elements.beta.below, [{ selector: '.x', properties: ['font-size'], alsoWhen: '(pointer: coarse)' }]);
    assert.deepEqual(Object.keys(report.byBreakpoint.tablet.elements), ['beta']);
    assert.equal(report.byBreakpoint.wide.elementCount, 0);
    assert.equal(report.byBreakpoint.phone.ruleCount, 4);
    assert.deepEqual(report.unnamed, [{ element: 'beta', selector: '.z', width: 700, direction: 'below' }]);
    assert.ok(!('plain' in report.byBreakpoint.phone.elements));
    // Deterministic: the same input gives the same bytes.
    assert.equal(JSON.stringify(buildReport([{ name: 'alpha', css: '@media (max-width: 640px) { .a { top: 0; } }' }], bps)), JSON.stringify(buildReport([{ name: 'alpha', css: '@media (max-width: 640px) { .a { top: 0; } }' }], bps)));
});

test('a custom set moves the deltas: the same CSS resolved at other widths is attributed to those names', () => {
    const custom = parseBreakpoints({ phone: 480, tablet: 900 });
    const report = buildReport([{ name: 'alpha', css: '@media (max-width: 480px) { .a { top: 0; } } @media (min-width: 901px) { .b { top: 0; } }' }], custom);
    assert.deepEqual(report.byBreakpoint.phone.elements.alpha.below.map(r => r.selector), ['.a']);
    assert.equal(report.byBreakpoint.tablet.elements.alpha.above[0].selector, '.b');
    assert.deepEqual(report.unnamed, []);
});

test('formatTable prints one section per breakpoint with the changed properties per element', () => {
    const table = formatTable(buildReport([{ name: 'alpha', css: '@media (max-width: 640px) { .a { min-height: 44px; } } @media (min-width: 641px) { .a { top: 0; } }' }], bps));
    assert.match(table, /^phone \(640px\): elements 1, rules 2$/m);
    assert.match(table, /^ {2}alpha {2}at or below: min-height {2}\| {2}above: top$/m);
    assert.match(table, /^tablet \(1024px\): elements 0, rules 0$/m);
});

test('the built report (dist/breakpoints.report.json) covers the real elements and has no stray width', () => {
    const report = JSON.parse(fs.readFileSync(core + 'dist/breakpoints.report.json', 'utf8'));
    assert.deepEqual(report.breakpoints, bps);
    assert.deepEqual(report.unnamed, [], 'every element width is a named breakpoint');
    assert.ok(report.byBreakpoint.phone.elements.dialog.below.some(r => r.properties.includes('border-radius')));
    assert.ok(report.byBreakpoint.tablet.elements['side-nav'].below.length > 0 && report.byBreakpoint.tablet.elements['form-section'].above.length === 1);
    assert.ok(report.byBreakpoint.wide.elements.workspace.below.some(r => r.properties.includes('--_nav-w')));
    assert.ok('page-layer' in report.byBreakpoint.phone.elements, 'tokens and base are part of the report');
});

test('the page layer is well formed: balanced braces, and the --pk-bp-* rule is a real top-level rule of dist/plainkit.css', () => {
    for (const f of ['tokens/tokens.css', 'base/base.css', 'base/a11y.css', 'base/table-content.css', 'dist/plainkit.css']) assert.doesNotThrow(() => splitRules(fs.readFileSync(core + f, 'utf8')), f);
    const rules = splitRules(fs.readFileSync(core + 'dist/plainkit.css', 'utf8'));
    assert.ok(rules.some(r => r.prelude === ':root' && r.body.includes('--pk-bp-phone:640px')), 'the breakpoint properties are swallowed by a stray brace before them');
    assert.ok(rules.some(r => r.prelude === '*' && r.body.includes('box-sizing')), 'the first base rule survives');
});
