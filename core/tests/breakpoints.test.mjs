// Named breakpoints (tokens/breakpoints.json, tools/breakpoints.mjs): the source is valid, the transform is exact, and the build writes the custom properties.
import './needs-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseBreakpoints, loadBreakpoints, conditionMap, resolveCustomMedia, breakpointProperties } from '../tools/breakpoints.mjs';

const core = fileURLToPath(new URL('..', import.meta.url));
const read = f => fs.readFileSync(core + f, 'utf8').replace(/\r\n/g, '\n');
const bps = parseBreakpoints({ phone: 640, tablet: 1024, wide: 1280 });

test('the default set is phone 640, tablet 1024, wide 1280', () => {
    assert.deepEqual(loadBreakpoints(), bps);
});

test('parseBreakpoints rejects bad names, non-integer, unsorted and empty sets', () => {
    assert.throws(() => parseBreakpoints({}), /at least one/);
    assert.throws(() => parseBreakpoints({ 'big-screen': 1600 }), /not a valid name/);
    assert.throws(() => parseBreakpoints({ Phone: 640 }), /not a valid name/);
    assert.throws(() => parseBreakpoints({ a: 640.5 }), /integer/);
    assert.throws(() => parseBreakpoints({ a: 1024, b: 640 }), /ascend/);
    assert.throws(() => parseBreakpoints({ a: 640, b: 640 }), /ascend/);
});

test('a name stands for max-width, above- for the complement min-width one pixel further', () => {
    const m = conditionMap(bps);
    assert.equal(m.get('phone'), '(max-width: 640px)');
    assert.equal(m.get('above-phone'), '(min-width: 641px)');
    assert.equal(m.get('above-wide'), '(min-width: 1281px)');
});

test('resolveCustomMedia replaces plain, complement and combined forms, keeping every other byte', () => {
    const css = [
        '@media (--phone) { a { color: red; } }',
        '@media (--above-phone) { b { top: 0; } }',
        '@media (--phone) and (orientation: portrait) { c { top: 1px; } }',
        '@media (pointer: coarse), (--phone) { d { top: 2px; } }',
        '@media (--above-phone) and (--tablet) { e { top: 3px; } }',
        '@media ( --wide ){ f { top: 4px; } }',
        '@media (prefers-reduced-motion: reduce) { g { top: 5px; } }',
    ].join('\n');
    assert.equal(resolveCustomMedia(css, bps), [
        '@media (max-width: 640px) { a { color: red; } }',
        '@media (min-width: 641px) { b { top: 0; } }',
        '@media (max-width: 640px) and (orientation: portrait) { c { top: 1px; } }',
        '@media (pointer: coarse), (max-width: 640px) { d { top: 2px; } }',
        '@media (min-width: 641px) and (max-width: 1024px) { e { top: 3px; } }',
        '@media (max-width: 1280px){ f { top: 4px; } }',
        '@media (prefers-reduced-motion: reduce) { g { top: 5px; } }',
    ].join('\n'));
});

test('css without a name comes back identical (the default output does not change)', () => {
    const css = '@media (max-width: 640px) { a { top: 0; } }\n.x { --phone: 1; margin: var(--phone); }\n@container (max-width: 30rem) { b { top: 1px; } }\n';
    assert.equal(resolveCustomMedia(css, bps), css);
});

test('only a name inside an @media condition is touched: not a var(), a declaration, a container query or a comment', () => {
    const css = '/* @media (--nope) { } */\n.a { width: calc(var(--phone) * 2); background: paint(--phone); }\n@container (--phone) { .b { top: 0; } }\n';
    assert.equal(resolveCustomMedia(css, bps), css);
});

test('an unknown name is an error that names the file, the line and the known names', () => {
    const css = '.a { top: 0; }\n\n@media (--phon) { .b { top: 1px; } }\n';
    assert.throws(() => resolveCustomMedia(css, bps, 'elements/x/x.css'), err => {
        assert.match(err.message, /elements\/x\/x\.css:3:/);
        assert.match(err.message, /"--phon"/);
        assert.match(err.message, /--phone, --above-phone, --tablet/);
        return true;
    });
    assert.throws(() => resolveCustomMedia('@media (--above-) { a { top: 0 } }', bps), /unknown breakpoint/);
});

test('a custom set (an export) resolves to its own widths', () => {
    const custom = parseBreakpoints({ phone: 480, tablet: 900 });
    assert.equal(resolveCustomMedia('@media (--phone) { a { top: 0 } } @media (--above-tablet) { b { top: 0 } }', custom), '@media (max-width: 480px) { a { top: 0 } } @media (min-width: 901px) { b { top: 0 } }');
});

test('the build writes --pk-bp-* custom properties into plainkit.css and dist/plainkit.css', () => {
    const rule = breakpointProperties(bps);
    assert.equal(rule, ':root{--pk-bp-phone:640px;--pk-bp-tablet:1024px;--pk-bp-wide:1280px}');
    assert.ok(read('plainkit.css').includes(rule), 'plainkit.css lacks the breakpoint properties');
    assert.ok(read('dist/plainkit.css').includes(rule));
    assert.ok(read('dist/plainkit.min.css').includes(rule));
});

// The conditions the built element modules and the page layer carried before the breakpoints were named (fixtures/media-conditions.baseline.json,
// taken from the build at the commit before): naming them must not change a single one, so the default output stays compatible.
test('the built element modules and page layer carry exactly the media conditions they carried before', () => {
    const baseline = JSON.parse(read('tests/fixtures/media-conditions.baseline.json'));
    const conditions = text => [...text.matchAll(/@media\s*([^{]*)\{/g)].map(m => m[1].trim().replace(/\s+/g, ' '));
    const built = {};
    for (const f of fs.readdirSync(core + 'dist/elements').filter(x => x.endsWith('.js') && x !== 'registry.js').sort()) {
        const c = conditions(read(`dist/elements/${f}`));
        if (c.length) built[f.replace(/\.js$/, '')] = c;
    }
    built['plainkit.css'] = conditions(read('dist/plainkit.css'));
    assert.deepEqual(built, baseline);
});
