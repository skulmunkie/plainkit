// Security and defect gates. Run: node --test sdk
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { scan, bySeverity, unsafeRegex, RULES, isReassigned } from '../tools/security.mjs';
import { build } from '../tools/build.mjs';
import { sanitizeOverrides, sanitizeDict, parseOverrides, buildOverrides, MAX_OVERRIDES } from '../js/theme.js';
import { matcherFor } from '../js/code-explorer/providers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

test('no critical or high finding, and the counts per severity never rise above the baseline', () => {
    const counts = bySeverity(scan());
    const baseline = JSON.parse(read('site/scorecard/security.baseline.json')).counts;
    assert.equal(counts.critical, 0, 'critical finding');
    assert.equal(counts.high, 0, 'high finding');
    for (const s of ['medium', 'low']) assert.ok(counts[s] <= baseline[s], `${s} findings rose from ${baseline[s]} to ${counts[s]}`);
});

test('no page or sample runs an inline script, so the whole site runs under script-src \'self\'', () => {
    const inline = scan().filter(f => f.rule === 'csp-inline-script' || f.rule === 'no-inline-handler');
    assert.deepEqual(inline.map(f => `${f.file}:${f.line}`), []);
});

test('no markup anywhere carries an inline style, so the whole site runs under a strict style-src', () => {
    const inline = scan().filter(f => f.rule === 'no-inline-style-attr' || f.rule === 'no-inline-style-attr-js' || f.rule === 'csp-inline-style');
    assert.deepEqual(inline.map(f => `${f.file}:${f.line}`), []);
});

test('the gallery data (element examples and pattern and layout markup) carries no style attribute or style element', async () => {
    const { ELEMENTS, PATTERNS, LAYOUTS } = await import('../site/gallery/gallery.data.js');
    const text = JSON.stringify([ELEMENTS, PATTERNS, LAYOUTS]);
    assert.doesNotMatch(text, /\sstyle\s*=|<style[\s>]/);
});

test('each scanner rule fires on hostile input', () => {
    assert.ok(RULES.find(r => r.id === 'no-inline-style-attr').pattern.test('<p style="color:red">'));
    assert.ok(RULES.find(r => r.id === 'no-inline-style-attr-js').pattern.test('`<span style="width:1px">`'));
    assert.ok(!RULES.find(r => r.id === 'no-inline-style-attr').pattern.test('<p class="a">'));
    const hit = (id, text) => RULES.find(r => r.id === id).pattern.test(text);
    assert.ok(hit('no-eval', 'eval("x")')); assert.ok(hit('no-new-function', 'new Function("x")')); assert.ok(hit('no-document-write', 'document.write("x")'));
    assert.ok(hit('no-javascript-url', 'href="javascript:alert(1)"')); assert.ok(hit('no-inline-handler', '<a onclick="x()">'));
    assert.ok(hit('blank-needs-noopener', '<a target="_blank" href="x">')); assert.ok(!hit('blank-needs-noopener', '<a target="_blank" rel="noopener" href="x">'));
    assert.ok(hit('secret-token', 'ghp_' + 'a'.repeat(36))); assert.ok(hit('secret-private-key', '-----BEGIN RSA PRIVATE KEY-----')); // secret-scan:allow (a fixture for the scanner rule)
    assert.ok(hit('secret-assignment', 'password: "hunter2hunter2"')); assert.ok(hit('no-external-request', 'fetch("https://cdn.example.net/x.js")'));
});

test('the SDK has no dependencies and no lockfile (a package.json may exist for publishing, with none declared)', () => {
    for (const f of ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']) assert.ok(!fs.existsSync(path.join(root, f)), f);
    if (fs.existsSync(path.join(root, 'package.json'))) for (const k of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) assert.equal(JSON.parse(read('package.json'))[k], undefined, `package.json declares ${k}`);
    assert.deepEqual(JSON.parse(read('dist/manifest.json')).dependencies, []);
});

test('the dist manifest lists every file with a correct SRI hash, and a rebuild is byte-identical', () => {
    const manifest = JSON.parse(read('dist/manifest.json'));
    assert.ok(manifest.files.length > 60);
    for (const f of manifest.files.slice(0, 40)) assert.equal(f.integrity, 'sha384-' + crypto.createHash('sha384').update(fs.readFileSync(path.join(root, 'dist', f.path))).digest('base64'), f.path);
    // Build in memory (write: false): rewriting dist/ here would race the C# tests that read it in parallel.
    const { out } = build({ write: false });
    for (const f of ['dist/manifest.json', 'dist/plainkit.css', 'plainkit.css', 'site/gallery/gallery.data.js']) assert.equal(out.get(f), fs.readFileSync(path.join(root, f), 'utf8'), `${f} is stale: run node core/tools/build.mjs`);
});

test('hostile override input cannot pollute a prototype and is validated like PkThemeOverrides', () => {
    const hostile = JSON.parse('{"shared":{"__proto__":"x","constructor":"y","prototype":"z","--ok":"1px","--bad":"url(x)","--a b":"1"},"dark":{"__proto__":{"polluted":"yes"}},"light":"nope"}');
    const clean = sanitizeOverrides(hostile);
    assert.deepEqual(clean, { shared: { '--ok': '1px' }, dark: {}, light: {} });
    assert.equal({}.polluted, undefined); assert.equal(Object.prototype.polluted, undefined);
    const viaCss = parseOverrides(':root { --ok: red; __proto__: x; } [data-theme="light"] { --x: expression(1); }');
    assert.deepEqual(viaCss.dark, { '--ok': 'red' }); assert.deepEqual(viaCss.light, {});
    assert.deepEqual(sanitizeOverrides(null), { shared: {}, dark: {}, light: {} });
    assert.deepEqual(sanitizeDict([1, 2]), {});
    const many = Object.fromEntries(Array.from({ length: MAX_OVERRIDES + 50 }, (_, i) => [`--t-${i}`, '1px']));
    assert.equal(Object.keys(sanitizeDict(many)).length, MAX_OVERRIDES);
    assert.equal(buildOverrides({ shared: { '--ok': '1px' } }).rejected.length, 0);
});

test('a user regex in the code explorer search is refused when it could backtrack catastrophically', () => {
    for (const bad of ['(a+)+$', '(.*)*x', '(a|aa)+b'.replace('(a|aa)+b', '(a+)*b'), 'x'.repeat(201), '.*.*.*z']) assert.notEqual(unsafeRegex(bad), null, bad);
    for (const ok of ['foo.*bar', '^const\\s+\\w+', '[A-Z][a-z]+']) assert.equal(unsafeRegex(ok), null, ok);
    assert.throws(() => matcherFor('/(a+)+$/'), /regex refused/);
    const t0 = Date.now(); const m = matcherFor('/foo.*bar/'); m('foo' + 'x'.repeat(100000)); assert.ok(Date.now() - t0 < 500, 'a very long line is truncated before matching');
});

// The public API (classes, tokens, JS exports, element tags/props/events/slots/parts) may change between releases. What a release must do about
// it is checked when the version changes: node core/tools/versioning.mjs bump --require (see tests/versioning.test.mjs and CONTRIBUTING.md).

test('prefer-const flags a let that is never reassigned and passes one that is', () => {
    const ls = ['let a = 1;', 'let b = 2;', 'b += 3;', 'let c = 0;', 'c++;', 'let d = 4;', 'if (d == 4) {}', 'let e;', 'e = 5;', 'let f = 1;', 'const g = f === 1;'];
    assert.equal(isReassigned(ls, 'a', 0), false);
    assert.equal(isReassigned(ls, 'b', 1), true);
    assert.equal(isReassigned(ls, 'c', 3), true);
    assert.equal(isReassigned(ls, 'd', 5), false, '== is a comparison');
    assert.equal(isReassigned(ls, 'e', 7), true);
    assert.equal(isReassigned(ls, 'f', 9), false, '=== is a comparison');
});
