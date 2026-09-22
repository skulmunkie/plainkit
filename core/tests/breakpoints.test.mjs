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
    // The only two conditions that changed when the literals became names (#124), both recorded here so nothing else can change silently:
    // pk-grid's range syntax (width <= 640px) now reads (max-width: 640px), the same query; pk-form-section's (min-width: 1024px) is now
    // (--above-tablet) = (min-width: 1025px), so the desktop layout starts one pixel later and the tablet band no longer overlaps at exactly 1024px.
    const recorded = { grid: { '(width <= 640px)': '(max-width: 640px)' }, 'form-section': { '(min-width: 1024px)': '(min-width: 1025px)' } };
    const expected = Object.fromEntries(Object.entries(baseline).map(([k, list]) => [k, list.map(c => recorded[k]?.[c] ?? c)]));
    assert.deepEqual(built, expected);
});

test('no literal breakpoint remains: element CSS uses names, unbuilt CSS only the named widths, and no matchMedia holds a width', () => {
    const widths = new Set(bps.flatMap(b => [b.width, b.width + 1]));
    const files = dir => fs.readdirSync(core + dir, { recursive: true }).map(f => `${dir}/${f.replace(/\\/g, '/')}`);
    const problems = [];
    // Element CSS is built, so it names its breakpoints: any (min|max)-width or range condition with a px value in an @media is a literal.
    for (const f of files('elements').filter(x => x.endsWith('.css'))) {
        for (const m of read(f).matchAll(/@media([^{;]*)\{/g)) if (/(?:min|max)-width\s*:|width\s*[<>]=?|\d+px/.test(m[1])) problems.push(`${f}: @media${m[1]}uses a literal width; write (--phone), (--above-phone), (--tablet)...`);
    }
    // CSS the site loads unbuilt cannot use a name; its literal widths must be a named one (or one above it).
    const unbuilt = ['tokens', 'base', 'site', 'modules', 'samples', 'layouts'].flatMap(files).filter(x => x.endsWith('.css'));
    for (const f of unbuilt) {
        for (const m of read(f).matchAll(/@media([^{;]*)\{/g)) {
            if (/\(\s*--/.test(m[1])) problems.push(`${f}: @media${m[1]}names a breakpoint, but this file is served unbuilt; write the literal width`);
            for (const w of m[1].matchAll(/(?:min|max)-width\s*:\s*(\d+)px/g)) if (!widths.has(Number(w[1]))) problems.push(`${f}: @media${m[1]}has ${w[1]}px, which is not a named breakpoint (tokens/breakpoints.json)`);
        }
    }
    // Scripts read the widths through js/breakpoints.js.
    const scripts = ['elements', 'js', 'modules', 'site', 'samples', 'layouts', 'tests/browser'].flatMap(files).filter(x => /\.(js|mjs)$/.test(x) && !/\.test\.mjs$/.test(x) && !x.endsWith('.element.js') && !x.endsWith('.data.js'));
    for (const f of scripts) if (/matchMedia\(\s*[`'"][^)]*(?:min|max)-width/.test(read(f))) problems.push(`${f}: matchMedia with a literal width; use mediaBelow('phone') from js/breakpoints.js`);
    assert.deepEqual(problems, []);
});

test('js/breakpoints.js defaults equal tokens/breakpoints.json, and its helper reads --pk-bp-* and falls back with a debug line', async () => {
    const { DEFAULT_BREAKPOINTS, breakpoint, belowQuery, aboveQuery } = await import('../js/breakpoints.js');
    assert.deepEqual({ ...DEFAULT_BREAKPOINTS }, Object.fromEntries(bps.map(b => [b.name, b.width])));
    assert.equal(breakpoint('phone'), 640);           // no document here: the default
    assert.equal(belowQuery('tablet'), '(max-width: 1024px)');
    assert.equal(aboveQuery('phone'), '(min-width: 641px)');
    assert.throws(() => breakpoint('huge'), /unknown breakpoint/);
    const g = globalThis; const saved = { document: g.document, getComputedStyle: g.getComputedStyle };
    try {
        g.document = { documentElement: {} }; g.getComputedStyle = () => ({ getPropertyValue: p => (p === '--pk-bp-phone' ? ' 480px' : '') });
        assert.equal(breakpoint('phone'), 480);
        assert.equal(aboveQuery('phone'), '(min-width: 481px)');
        assert.equal(breakpoint('tablet'), 1024);       // not defined: the default
    } finally { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete g[k]; else g[k] = v; } }
});
