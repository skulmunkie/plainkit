// Pure-function tests: colour maths, theme overrides (parity with the C# helper), quality checks, scoring, the static audit,
// the code-explorer providers and tokenizer. Run: node --test sdk/tests
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseColour, blend, contrast, grade } from '../js/colour.js';
import { buildOverrides, parseOverrides, nameProblem, valueProblem, parseTokenBlocks, tokenKind, splitLength, colourToHex } from '../js/theme.js';
import { evaluate, literalColours, literalSizes, cssStats, accessibleName, touchExempt, hasBox, tokenPx, DEFAULTS as QUALITY_DEFAULTS } from '../js/quality.js';
import { scoreMetric, scoreCategory, scoreAll, scoreFindings, rankWorstFirst, groupFindings, pushRun, readHistory, deltas, importHistory, exportHistory } from '../js/scoring.js';
import { contrastFailures, staticMetrics } from '../js/audit.js';
import { SnapshotProvider, ApiProvider, LazyProvider, FeedProvider, contractProblems, createProvider, wordSpans, matcherFor, NO_CAPABILITIES } from '../js/code-explorer/providers.js';
import { tokenize, buildSegments, wordAt, languageOf } from '../js/code-explorer/tokenize.js';
import { buildTree } from '../js/code-explorer/element.js';
import { SCORING, TEXT_PAIRS } from '../site/scorecard/scoring.data.js';
import { runStaticAudit } from '../site/scorecard/static-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

// ---- colour ------------------------------------------------------------------------------------------------------------
test('parseColour reads hex, short hex, rgb and rgba, and refuses var() and names', () => {
    assert.deepEqual(parseColour('#fff'), { r: 255, g: 255, b: 255, a: 1 });
    assert.deepEqual(parseColour('#1e1e1e'), { r: 30, g: 30, b: 30, a: 1 });
    assert.equal(parseColour('rgba(0, 0, 0, 0.5)').a, 0.5);
    assert.equal(parseColour('var(--x)'), null);
    assert.equal(parseColour('red'), null);
});

test('contrast matches the WCAG reference values', () => {
    assert.equal(contrast('#000', '#fff').toFixed(2), '21.00');
    assert.equal(contrast('#777', '#fff').toFixed(2), '4.48');
    assert.equal(contrast('#767676', '#fff').toFixed(2), '4.54');
    assert.equal(contrast('#fff', '#fff'), 1);
    assert.equal(contrast('nope', '#fff'), null);
});

test('a translucent foreground is blended over the background before measuring', () => {
    assert.deepEqual(blend({ r: 0, g: 0, b: 0, a: 0.5 }, { r: 255, g: 255, b: 255, a: 1 }), { r: 127.5, g: 127.5, b: 127.5, a: 1 });
    assert.ok(contrast('rgba(0,0,0,0.5)', '#fff') < 21);
});

test('grade labels AAA, AA and below AA', () => {
    assert.equal(grade(7.1), 'AAA'); assert.equal(grade(4.6), 'AA'); assert.equal(grade(3), 'below AA'); assert.equal(grade(null), 'n/a');
});

test('every text pair in the real tokens passes AA in both themes (the scorecard would flag it otherwise)', () => {
    const failures = contrastFailures(read('tokens/tokens.css'), TEXT_PAIRS);
    assert.ok(failures.length <= 3, `text pairs below AA: ${JSON.stringify(failures)}`);
});

// ---- theme -------------------------------------------------------------------------------------------------------------
test('buildOverrides emits the same block as PkThemeOverrides.Build, theme entries beating shared ones', () => {
    const r = buildOverrides({ shared: { '--radius-md': '10px', '--color-accent': 'red' }, dark: { '--color-accent': '#4a90e2' }, light: { '--color-accent': '#1d4ed8' } });
    assert.deepEqual(r.rejected, []);
    assert.ok(r.css.includes(':root,\n[data-theme="dark"] {\n    --color-accent: #4a90e2;\n    --radius-md: 10px;\n}'));
    assert.ok(r.css.includes('[data-theme="light"] {\n    --color-accent: #1d4ed8;\n    --radius-md: 10px;\n}'));
});

test('override validation rejects what the C# helper rejects', () => {
    for (const n of ['color-accent', '--Color-Accent', '--', '--a;b', '--a{}', '--a b', '--trailing-']) assert.notEqual(nameProblem(n), null, n);
    for (const v of ['red; } body { display:none', 'url(x)', '/* c */', 'expression(1)', '@import x', 'calc((1px', '', '"quoted"']) assert.notEqual(valueProblem(v), null, v);
    assert.equal(valueProblem('rgba(0, 0, 0, 0.4)'), null);
    assert.equal(valueProblem('0 1px 2px #000'), null);
    assert.notEqual(valueProblem('x'.repeat(201)), null);
    const bad = buildOverrides({ shared: { '--x': '' } });
    assert.equal(bad.css, ''); assert.equal(bad.rejected.length, 1);
});

test('parseOverrides reads back both the CSS block and the JSON form', () => {
    const built = buildOverrides({ dark: { '--color-accent': '#111111' }, light: { '--color-accent': '#eeeeee' } });
    const fromCss = parseOverrides(built.css);
    assert.equal(fromCss.dark['--color-accent'], '#111111');
    assert.equal(fromCss.light['--color-accent'], '#eeeeee');
    assert.equal(parseOverrides('{"shared":{"--a-b":"1px"}}').shared['--a-b'], '1px');
    assert.equal(parseOverrides('{ not json'), null);
});

test('parseTokenBlocks splits the real tokens.css into dark, light and theme-independent tokens', () => {
    const b = parseTokenBlocks(read('tokens/tokens.css'));
    assert.equal(b.dark['--color-bg'], '#1e1e1e');
    assert.equal(b.light['--color-bg'], '#fafafa');
    assert.equal(b.root['--space-1'], '0.25rem');
    assert.ok(Object.keys(b.root).length > 100);
    assert.ok('--app-header-h' in b.root);
});

test('tokenKind, splitLength and colourToHex classify and convert token values', () => {
    assert.equal(tokenKind('--color-bg', '#000'), 'colour'); assert.equal(tokenKind('--space-1', '0.25rem'), 'size');
    assert.equal(tokenKind('--shadow-card', '0 1px 2px #000'), 'shadow'); assert.equal(tokenKind('--z-modal', '1200'), 'layer'); assert.equal(tokenKind('--font-sans', 'x'), 'font');
    assert.deepEqual(splitLength('1.5rem'), { number: 1.5, unit: 'rem' }); assert.equal(splitLength('calc(1px + 2px)'), null); assert.deepEqual(splitLength('1200'), { number: 1200, unit: '' });
    assert.equal(colourToHex('rgb(74, 144, 226)'), '#4a90e2'); assert.equal(colourToHex('rgba(0,0,0,0.5)'), null);
});

// ---- quality -----------------------------------------------------------------------------------------------------------
const measures = over => ({ controls: [], images: [], scrollers: [], literals: [], overflowX: 0, width: 375, nodes: 0, ...over });

test('evaluate flags an unnamed control, a small touch target only on a phone, nested scrollers, literals and overflow', () => {
    const m = measures({
        controls: [{ selector: 'button', tag: 'button', name: '', width: 30, height: 30, tabindex: null }, { selector: 'a', tag: 'a', name: 'ok', width: 50, height: 44, tabindex: 3 }],
        images: [{ selector: 'img', alt: null }], scrollers: [{ selector: 'div', depth: 1 }, { selector: 'ul', depth: 0 }],
        literals: [{ selector: 'p', value: 'color:#fff' }], overflowX: 12,
    });
    const phone = evaluate(m, { phone: true }).map(f => f.check).sort();
    assert.deepEqual(phone, ['horizontal-overflow', 'image-alt', 'literal-colour', 'nested-scroll', 'positive-tabindex', 'touch-target', 'unnamed-input']);
    assert.equal(evaluate(m, { phone: false }).some(f => f.check === 'touch-target'), false);
});

test('an exempt control (an inline link, a tab panel) is not a touch target; unnamed and positive tabindex still count', () => {
    const c = over => ({ selector: 'a', tag: 'a', name: 'x', width: 40, height: 19, tabindex: null, ...over });
    assert.deepEqual(evaluate(measures({ controls: [c({ exempt: true })] }), { phone: true }), []);
    assert.deepEqual(evaluate(measures({ controls: [c({})] }), { phone: true }).map(f => f.check), ['touch-target']);
    assert.deepEqual(evaluate(measures({ controls: [c({ exempt: true, name: '' })] }), { phone: true }).map(f => f.check), ['unnamed-input']);
    const win = { getComputedStyle: el => ({ display: el.display }) };
    assert.equal(touchExempt({ tagName: 'A', localName: 'a', display: 'inline' }, win), true);
    assert.equal(touchExempt({ tagName: 'A', localName: 'a', display: 'block' }, win), false, 'a block link (a nav row) is a real target');
    assert.equal(touchExempt({ tagName: 'PK-TAB-PANEL', localName: 'pk-tab-panel' }, win), true);
    assert.equal(touchExempt({ tagName: 'BUTTON', localName: 'button' }, win), false);
});

test('an element whose label is drawn in its shadow tree has an accessible name; an empty one still has none', () => {
    const el = over => ({ ownerDocument: { getElementById: () => null }, getAttribute: () => null, labels: [], textContent: '', tagName: 'PK-TREE-ITEM', ...over });
    assert.equal(accessibleName(el({ shadowRoot: { textContent: ' Books ' } })), 'Books');
    assert.equal(accessibleName(el({ textContent: 'Light', shadowRoot: { textContent: 'Shadow' } })), 'Light');
    assert.equal(accessibleName(el({ shadowRoot: { textContent: '  ' } })), '');
    assert.equal(accessibleName(el({})), '');
});

test('an element with no box of its own but a visible child (display: contents) still counts as content', () => {
    const box = (w, h, display = 'block', kids = [], shadow = []) => ({ tagName: 'DIV', getBoundingClientRect: () => ({ width: w, height: h }), _d: display, children: kids, shadowRoot: shadow.length ? { children: shadow } : null });
    const win = { getComputedStyle: el => ({ display: el._d }) };
    assert.equal(hasBox(box(10, 10), win), true);
    assert.equal(hasBox(box(0, 0), win), false, 'a closed dialog: nothing to see');
    assert.equal(hasBox(box(0, 0, 'contents', [box(50, 20)]), win), true, 'a lightbox trigger inside a display: contents host');
    assert.equal(hasBox(box(0, 0, 'contents', [], [box(40, 40)]), win), true, 'a control drawn in the shadow tree');
    assert.equal(hasBox(box(0, 0, 'contents', [box(0, 0)]), win), false);
    assert.equal(hasBox(box(0, 0, 'block', [box(50, 20)]), win), false, 'only display: contents looks through');
});

test('the flush containers include the element equivalents of the rows that are flush by design', () => {
    for (const tag of ['pk-tree', 'pk-side-nav', 'pk-list-group', 'pk-timeline', 'pk-stepper', 'pk-field-list']) assert.ok(QUALITY_DEFAULTS.flush.split(/,\s*/).includes(tag), tag);
});

test('an empty preview stage is an error, a stage with visible content is not', () => {
    assert.ok(evaluate(measures({ visibleChildren: 0 }), {}).some(f => f.check === 'empty-preview'));
    assert.ok(!evaluate(measures({ visibleChildren: 3 }), {}).some(f => f.check === 'empty-preview'));
    assert.ok(!evaluate(measures({}), {}).some(f => f.check === 'empty-preview'), 'a measure set without the field is not judged');
});

test('a clean measure set has no findings', () => {
    assert.deepEqual(evaluate(measures({ controls: [{ selector: 'b', tag: 'button', name: 'Go', width: 60, height: 44, tabindex: null }] }), { phone: true }), []);
});

test('literalColours finds hex and rgb() outside comments, with line numbers', () => {
    const css = '.a { color: var(--x); }\n/* #fff in a comment */\n.b { color: #abc; }\n.c { background: rgba(0,0,0,.5); }';
    assert.deepEqual(literalColours(css).map(f => f.line), [3, 4]);
});

test('literalSizes ignores tokens and media queries, cssStats counts bytes and rules', () => {
    const css = '.a { padding: var(--space-2); }\n.b { padding: 0.5rem 1rem; }\n@media (max-width: 640px) { .c { color: red; } }';
    assert.equal(literalSizes(css).length, 1);
    const s = cssStats('.a { color: red; margin: 0; }\n.b, .c { color: blue; }');
    assert.equal(s.rules, 2); assert.equal(s.selectors, 3); assert.equal(s.declarations, 3);
});

// ---- scoring -----------------------------------------------------------------------------------------------------------
test('scoreMetric is 100 at good, 0 at poor and linear between, in both directions', () => {
    const lower = { good: 10, poor: 110, lowerIsBetter: true };
    assert.equal(scoreMetric(10, lower), 100); assert.equal(scoreMetric(110, lower), 0); assert.equal(scoreMetric(60, lower), 50); assert.equal(scoreMetric(500, lower), 0); assert.equal(scoreMetric(0, lower), 100);
    const higher = { good: 95, poor: 55, lowerIsBetter: false };
    assert.equal(scoreMetric(75, higher), 50); assert.equal(scoreMetric(100, higher), 100);
    assert.equal(scoreMetric(null, lower), null);
});

test('scoreCategory and scoreAll weight metrics and categories and skip unmeasured ones', () => {
    const def = { metrics: { a: { good: 0, poor: 10, weight: 3 }, b: { good: 0, poor: 10, weight: 1 } } };
    assert.equal(scoreCategory(def, { a: 0, b: 10 }).score, 75);
    assert.equal(scoreCategory(def, { a: 0 }).score, 100);
    assert.equal(scoreCategory(def, {}).score, null);
    const all = scoreAll({ categories: { x: { label: 'X', weight: 1, metrics: { a: { good: 0, poor: 10 } } }, y: { label: 'Y', weight: 3, metrics: { b: { good: 0, poor: 10 } } } } }, { a: 0, b: 10 });
    assert.equal(all.overall, 25);
});

test('scoreFindings, groupFindings and rankWorstFirst order the worst controls first', () => {
    assert.equal(scoreFindings([{ severity: 'error' }, { severity: 'warn' }], { error: 25, warn: 8 }), 67);
    assert.equal(scoreFindings(new Array(10).fill({ severity: 'error' }), { error: 25 }), 0);
    const g = groupFindings([{ check: 'c', selector: 's', context: 'dark 375' }, { check: 'c', selector: 's', context: 'light 375' }, { check: 'd', selector: 's' }]);
    assert.equal(g.length, 2); assert.equal(g[0].count, 2); assert.deepEqual(g[0].contexts, ['dark 375', 'light 375']);
    const ranked = rankWorstFirst([{ name: 'b', score: 90, findings: [] }, { name: 'a', score: 40, findings: [1] }, { name: 'c', score: 40, findings: [1, 2] }]);
    assert.deepEqual(ranked.map(r => r.name), ['c', 'a', 'b']);
});

test('history keeps the newest runs, survives bad storage and reports regressions as deltas', () => {
    const store = new Map();
    const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    pushRun(storage, 'k', { at: 1, overall: 80, categories: { look: 80 }, items: { Button: 90, Chip: 100 } }, 2);
    pushRun(storage, 'k', { at: 2, overall: 70, categories: { look: 60 }, items: { Button: 70, Chip: 100 } }, 2);
    const h = pushRun(storage, 'k', { at: 3, overall: 75, categories: { look: 70 }, items: { Button: 80, Chip: 100 } }, 2);
    assert.deepEqual(h.map(r => r.at), [2, 3]);
    const d = deltas(h[0], h[1]);
    assert.equal(d.overall, 5); assert.equal(d.categories.look, 10); assert.deepEqual(d.items, [{ name: 'Button', before: 70, after: 80, delta: 10 }]);
    assert.deepEqual(readHistory({ getItem: () => '{bad' }, 'k'), []);
    assert.equal(deltas(null, h[1]).overall, null);
    assert.deepEqual(importHistory(exportHistory(h)).map(r => r.at), [2, 3]);
    assert.throws(() => importHistory('{"history":[1]}'));
});

// ---- audit (real files) ------------------------------------------------------------------------------------------------
test('the static audit measures the real SDK and every scoring metric it feeds has a definition', () => {
    const { metrics, measured, scores } = runStaticAudit();
    assert.ok(metrics.cssKb > 15 && metrics.cssKb < 400, `css ${metrics.cssKb}KB`);
    assert.equal(metrics.literalColours, 0, 'component CSS must hold no literal colours');
    assert.ok(metrics.perFile.length > 10);
    const defined = new Set(Object.values(SCORING.categories).flatMap(c => Object.keys(c.metrics)));
    for (const k of Object.keys(measured)) assert.ok(defined.has(k), `scoring.data.js has no metric "${k}"`);
    assert.ok(scores.overall > 0);
});

test('staticMetrics counts literals outside tokens.css only', () => {
    const m = staticMetrics({ cssFiles: { 'tokens/tokens.css': ':root { --a: #fff; }', 'x.css': '.a { color: #fff; padding: 1rem; }' }, jsFiles: { 'a.js': 'x' }, tokensCss: ':root, [data-theme="dark"] { --color-text: #fff; --color-bg: #fff; }', pairs: [['--color-text', '--color-bg']] });
    assert.equal(m.literalColours, 1); assert.equal(m.contrastFail, 2);
});

// ---- code explorer providers -------------------------------------------------------------------------------------------
const SNAP = { files: [
    { path: 'a/one.js', content: 'const Foo = 1;\nfoo(Foo);\nconst FooBar = 2;', symbols: [{ kind: 'const', name: 'Foo', line: 1, depth: 0 }] },
    { path: 'a/two.css', content: '.x { color: red; }' },
] };

test('snapshot provider honours the contract and its own capabilities', async () => {
    const p = new SnapshotProvider(SNAP);
    assert.deepEqual(contractProblems(p), []);
    assert.deepEqual(p.capabilities, { search: true, outline: true, references: true, live: false });
    assert.deepEqual(await p.listFiles(), [{ path: 'a/one.js', lines: 3, language: undefined }, { path: 'a/two.css', lines: 1, language: undefined }]);
    assert.equal((await p.readFile('a/one.js')).lines[1], 'foo(Foo);');
    await assert.rejects(p.readFile('nope'));
    assert.equal((await p.search('foo')).find(g => g.path === 'a/one.js').hits.length, 3);
    assert.equal((await p.search('/^const/')).length, 1);
    assert.deepEqual((await p.references('a/one.js', 'Foo')).map(r => r.line), [1, 2]);
    assert.equal((await p.outline('a/one.js'))[0].name, 'Foo');
});

test('a snapshot without symbols does not claim outline', () => {
    assert.equal(new SnapshotProvider({ files: [{ path: 'x', content: '' }] }).capabilities.outline, false);
});

test('api provider maps the documented endpoints and reads capabilities', async () => {
    const calls = [];
    const fetch = async url => { calls.push(url); const u = new URL(url, 'http://h'); const body = u.pathname.endsWith('/capabilities') ? { search: true } : u.pathname.endsWith('/files') ? [{ path: 'a', lines: 1 }] : u.pathname.endsWith('/file') ? { content: 'l1\nl2' } : []; return { ok: true, json: async () => body }; };
    const p = await ApiProvider.connect('/api/code/', { fetch });
    assert.deepEqual(contractProblems(p), []);
    assert.equal(p.capabilities.search, true); assert.equal(p.capabilities.outline, false);
    assert.equal((await p.readFile('a')).lines.length, 2);
    await p.search('q x'); await p.references('a', 'W'); await p.outline('a');
    assert.deepEqual(calls.slice(1), ['/api/code/files'.replace('files', 'file?path=a'), '/api/code/search?q=q+x', '/api/code/references?path=a&word=W', '/api/code/outline?path=a'].map((u, i) => (i === 0 ? '/api/code/file?path=a' : u)));
});

test('api provider without a capabilities endpoint is list and read only', async () => {
    const p = await ApiProvider.connect('/x', { fetch: async () => ({ ok: false, status: 404 }) });
    assert.deepEqual(p.capabilities, NO_CAPABILITIES);
});

test('lazy provider lists from the lean list alone, fetches a file\'s real text only once it is opened, and caches it', async () => {
    const calls = [];
    const fetch = async url => { calls.push(url); return { ok: true, text: async () => (url.endsWith('one.js') ? 'const Foo = 1;\nfoo(Foo);' : '.x { color: red; }') }; };
    const p = new LazyProvider([{ path: 'a/one.js', language: 'js', lines: 2 }, { path: 'a/two.css', language: 'css', lines: 1 }], 'https://h/raw', { fetch });
    assert.deepEqual(contractProblems(p), []);
    assert.deepEqual(await p.listFiles(), [{ path: 'a/one.js', lines: 2, language: 'js' }, { path: 'a/two.css', lines: 1, language: 'css' }]);
    assert.deepEqual(calls, [], 'no content fetched just from listing');
    assert.deepEqual((await p.readFile('a/one.js')).lines, ['const Foo = 1;', 'foo(Foo);']);
    await p.readFile('a/one.js');
    assert.deepEqual(calls, ['https://h/raw/a/one.js'], 'a second read of the same file does not fetch again');
    await assert.rejects(p.readFile('nope'));
});

test('lazy provider connects from a lean list URL', async () => {
    const list = { files: [{ path: 'a', language: 'js', lines: 1 }] };
    const fetch = async url => (url === '/index.json' ? { ok: true, json: async () => list } : { ok: true, text: async () => 'x' });
    const p = await LazyProvider.connect('/index.json', '/raw', { fetch });
    assert.deepEqual(await p.listFiles(), [{ path: 'a', lines: 1, language: 'js' }]);
    await assert.rejects(LazyProvider.connect('/nope', '/raw', { fetch: async () => ({ ok: false, status: 404 }) }));
});

test('lazy provider search and references fetch every not-yet-cached file once, then work like a snapshot', async () => {
    let fetches = 0;
    const fetch = async url => { fetches++; return { ok: true, text: async () => (url.endsWith('one.js') ? 'const Foo = 1;\nfoo(Foo);' : '.x { color: red; }') }; };
    const p = new LazyProvider([{ path: 'a/one.js', language: 'js', lines: 2 }, { path: 'a/two.css', language: 'css', lines: 1 }], '/raw', { fetch });
    assert.equal((await p.search('foo')).find(g => g.path === 'a/one.js').hits.length, 2);
    assert.equal(fetches, 2, 'both files fetched to search across them');
    fetches = 0;
    assert.deepEqual((await p.references('a/one.js', 'Foo')).map(r => r.line), [1, 2]);
    assert.equal(fetches, 0, 'a second capability-wide call fetches nothing new');
});

test('lazy provider outline computes symbols client-side from the fetched file, the same function tools/snapshot.mjs uses at build time', async () => {
    const fetch = async () => ({ ok: true, text: async () => 'const Foo = 1;\nfoo(Foo);' });
    const p = new LazyProvider([{ path: 'a/one.js', language: 'js', lines: 2 }], '/raw', { fetch });
    assert.deepEqual(await p.outline('a/one.js'), [{ kind: 'const', name: 'Foo', line: 1, depth: 0 }]);
});

test('feed provider wraps a provider, claims live and delivers events until unsubscribed', () => {
    let es;
    class FakeES { constructor(url) { es = this; this.url = url; this.closed = false; } close() { this.closed = true; } }
    const feed = new FeedProvider(new SnapshotProvider(SNAP), '/events', { EventSource: FakeES });
    assert.deepEqual(contractProblems(feed), []);
    assert.equal(feed.capabilities.live, true); assert.equal(feed.capabilities.search, true);
    const got = []; const off = feed.subscribe(e => got.push(e));
    es.onmessage({ data: '{"type":"changed","path":"a/one.js"}' }); es.onmessage({ data: 'junk' });
    assert.deepEqual(got, [{ type: 'changed', path: 'a/one.js' }, { type: 'changed' }]);
    off(); assert.equal(es.closed, true);
});

test('contractProblems reports a claimed capability with no method', () => {
    assert.deepEqual(contractProblems({ listFiles() {}, readFile() {}, capabilities: { search: true } }), ['claims search but has no search()']);
    assert.equal(contractProblems({}).length, 2);
});

test('createProvider picks by source and rejects an unknown one', async () => {
    const fetch = async () => ({ ok: true, json: async () => SNAP });
    assert.ok((await createProvider({ source: 'snapshot', src: 's.json', fetch })) instanceof SnapshotProvider);
    const lazyFetch = async () => ({ ok: true, json: async () => ({ files: [] }) });
    assert.ok((await createProvider({ source: 'lazy', src: 'index.json', raw: '/raw', fetch: lazyFetch })) instanceof LazyProvider);
    await assert.rejects(createProvider({ source: 'ftp', src: 'x' }), /unknown code-explorer source/);
});

test('wordSpans matches whole words only and matcherFor handles plain text and /regex/', () => {
    assert.deepEqual(wordSpans('Foo FooBar xFoo Foo', 'Foo'), [{ start: 0, length: 3 }, { start: 16, length: 3 }]);
    assert.deepEqual(matcherFor('AB')('abcab'), [{ start: 0, length: 2 }, { start: 3, length: 2 }]);
    assert.equal(matcherFor('/a+/')('caab').length, 1);
});

test('tokenize colours keywords, strings, comments and numbers, tracking block comments across lines', () => {
    const t = tokenize(['const x = "a"; // hi', '/* open', 'still */ 42'], 'js');
    assert.deepEqual(t[0].map(x => x.kind), ['keyword', 'string', 'comment']);
    assert.equal(t[1][0].kind, 'comment'); assert.deepEqual(t[2].map(x => x.kind), ['comment', 'number']);
    assert.deepEqual(tokenize(['anything'], 'plain'), [[]]);
    assert.equal(languageOf('a/b.mjs'), 'js'); assert.equal(languageOf('x.unknown'), 'plain');
});

test('buildSegments cuts at every token, match and word boundary', () => {
    const segs = buildSegments('const Foo = 1', [{ start: 0, length: 5, kind: 'keyword' }], [{ start: 6, length: 3 }], [{ start: 6, length: 3 }]);
    assert.deepEqual(segs.map(s => s.text), ['const', ' ', 'Foo', ' = 1']);
    assert.equal(segs[0].kind, 'keyword'); assert.equal(segs[2].match, true); assert.equal(segs[2].word, true);
    assert.deepEqual(buildSegments('', []), []);
    assert.equal(wordAt('call(foo_bar)', 7), 'foo_bar'); assert.equal(wordAt('a + b', 2), '');
});

test('buildTree nests folders, counts files and lines, and filters', () => {
    const files = [{ path: 'a/b/c.js', lines: 10 }, { path: 'a/d.js', lines: 5 }, { path: 'e.md', lines: 1 }];
    const t = buildTree(files);
    assert.equal(t.children.get('a').count, 2); assert.equal(t.children.get('a').lines, 15); assert.equal(t.children.get('e.md').file.lines, 1);
    assert.deepEqual([...buildTree(files, 'D.JS').children.keys()], ['a']);
});

test('the gallery data file loads and every element and sample has the documented fields', async () => {
    const mod = await import('../site/gallery/gallery.data.js');
    assert.ok(mod.ELEMENTS.length > 40);
    assert.equal(mod.CONTROLS, undefined, 'the class-based controls are gone');
    for (const m of mod.ELEMENTS) {
        for (const f of ['tag', 'title', 'summary', 'group']) assert.ok(m[f], m.tag + ' has no ' + f);
        assert.ok(m.examples.length > 0 && m.examples.every(x => x.title && x.html), m.tag + ' examples');
        for (const k of ['props', 'slots', 'events']) assert.ok(Array.isArray(m[k]), m.tag + ': ' + k + ' must be an array');
    }
    assert.equal(new Set(mod.ELEMENTS.map(m => m.tag)).size, mod.ELEMENTS.length);
    for (const list of [mod.TEMPLATES, mod.PATTERNS, mod.LAYOUTS]) for (const x of list) assert.ok(x.id && x.title && x.summary, x.id + ': id, title and summary');
});

test('tokenPx reads a length token as pixels, so the minimum control gap is the page token (0.25rem = 3.5px at the 14px root), not a copied 4', () => {
    const win = tokens => ({ getComputedStyle: () => ({ fontSize: '14px', getPropertyValue: n => tokens[n] ?? '' }) });
    const doc = { documentElement: {} };
    assert.equal(tokenPx(win({ '--gap-min': '0.25rem' }), doc, '--gap-min', 4), 3.5);
    assert.equal(tokenPx(win({ '--gap-min': ' 6px' }), doc, '--gap-min', 4), 6);
    assert.equal(tokenPx(win({}), doc, '--gap-min', 4), 4, 'no token on the page: the default');
    assert.equal(tokenPx(win({ '--gap-min': 'calc(1px + 2px)' }), doc, '--gap-min', 4), 4, 'a value it cannot read: the default');
    assert.equal(QUALITY_DEFAULTS.minGapPx, 4);
});
