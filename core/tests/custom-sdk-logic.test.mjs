// The custom SDK export (js/custom-sdk-logic.js, js/zip-store.js, js/custom-sdk.js): theme and breakpoints are independent inputs; an export with the shipped settings is the
// shipped dist byte for byte; changed widths change exactly the conditions they name; the manifest and its SRI values are recomputed; the zip unzips.
import './needs-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { customizeDist, buildBundle, themeBundle, validateBreakpoints, readShippedBreakpoints, rewriteMedia, rewriteProperties, themeCssProblem, integrityOf, manifestText, readSettings, settingsText, deltaRows, RANGE } from '../js/custom-sdk-logic.js';
import { zipStore, crc32 } from '../js/zip-store.js';
import { fetchDist, exportSdk, exportTheme } from '../js/custom-sdk.js';
import { buildOverrides } from '../js/theme.js';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const dec = new TextDecoder(); const enc = new TextEncoder();
const shippedManifest = JSON.parse(fs.readFileSync(dist + 'manifest.json', 'utf8'));
const load = () => new Map([['manifest.json', new Uint8Array(fs.readFileSync(dist + 'manifest.json'))], ...shippedManifest.files.map(f => [f.path, new Uint8Array(fs.readFileSync(dist + f.path))])]);
const text = (files, p) => dec.decode(files.get(p));
const NAMES = ['phone', 'tablet', 'wide'];
const DEFAULTS = { phone: 640, tablet: 1024, wide: 1280 };
const overrides = { shared: { '--radius-md': '2px' }, dark: { '--color-accent': '#123456' }, light: { '--color-accent': '#654321' } };
const theme = { overrides, css: buildOverrides(overrides).css };
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const changedPaths = (before, after) => [...after.keys()].filter(p => !before.has(p) || !same(before.get(p), after.get(p))).sort();
const count = (s, re) => (s.match(re) ?? []).length;
// The number of @media conditions in a text that carry the width (both directions), counted independently of the rewrite.
const conditionsWith = (s, w) => [...s.matchAll(/@media([^{;]*)\{/g)].reduce((n, m) => n + count(m[1], new RegExp(`\\((?:max-width:\\s*${w}px|min-width:\\s*${w + 1}px)\\)`, 'g')), 0);
const total = (files, w) => [...files].filter(([p]) => /\.css$|^elements\/[^/]+\.js$/.test(p)).reduce((n, [, b]) => n + conditionsWith(dec.decode(b), w), 0);

test('the shipped dist declares 640, 1024 and 1280 and validation accepts them', () => {
    assert.deepEqual(readShippedBreakpoints(text(load(), 'plainkit.css')), DEFAULTS);
    assert.equal(validateBreakpoints(DEFAULTS, NAMES).ok, true);
});

test('validation: whole numbers, in range, ascending, with a gap; each problem names its breakpoint', () => {
    const bad = (input, name, re) => { const v = validateBreakpoints(input, NAMES); assert.equal(v.ok, false); assert.match(v.problems.find(p => p.name === name)?.message ?? '', re); };
    bad({ phone: 'wide', tablet: 1024, wide: 1280 }, 'phone', /whole number/);
    bad({ phone: 640.5, tablet: 1024, wide: 1280 }, 'phone', /whole number/);
    bad({ phone: '', tablet: 1024, wide: 1280 }, 'phone', /whole number/);
    bad({ phone: RANGE.min - 1, tablet: 1024, wide: 1280 }, 'phone', /between/);
    bad({ phone: 640, tablet: 1024, wide: RANGE.max + 1 }, 'wide', /between/);
    bad({ phone: 1024, tablet: 1024, wide: 1280 }, 'tablet', /wider than/);
    bad({ phone: 1100, tablet: 1024, wide: 1280 }, 'tablet', /wider than/);
    bad({ phone: 640, tablet: 660, wide: 1280 }, 'tablet', /at least 64/);
    assert.equal(validateBreakpoints({ phone: '700', tablet: '1100', wide: '1500' }, NAMES).ok, true, 'numbers typed as text are accepted');
    assert.deepEqual(validateBreakpoints({ phone: '700', tablet: '1100', wide: '1500' }, NAMES).widths, { phone: 700, tablet: 1100, wide: 1500 });
    assert.equal(validateBreakpoints({ phone: 640, tablet: 1024 }, NAMES).ok, false, 'a missing breakpoint');
});

test('defaults: an export with the shipped widths is the shipped dist byte for byte, manifest included', async () => {
    const files = load();
    for (const include of [{ theme: false, breakpoints: true }, { theme: false, breakpoints: false }, { theme: true, breakpoints: true }]) {
        const { files: out, summary } = await customizeDist(files, { include, breakpoints: DEFAULTS, theme: { css: '' } });
        assert.deepEqual(changedPaths(files, out), [], JSON.stringify(include));
        assert.equal(out.size, files.size);
        assert.equal(summary.changedBreakpoints, false);
    }
});

test('changing one breakpoint changes exactly the conditions that name it', async () => {
    const files = load();
    const before = { phone: total(files, 640), tablet: total(files, 1024), wide: total(files, 1280) };
    assert.ok(before.phone > 50 && before.tablet >= 6 && before.wide >= 1, JSON.stringify(before));
    const { files: out, summary } = await customizeDist(files, { include: { breakpoints: true }, breakpoints: { ...DEFAULTS, phone: 720 } });
    assert.equal(summary.counts.phone, before.phone, 'the replaced count equals the count found independently');
    assert.equal(summary.counts.tablet, before.tablet, 'the conditions found for an unchanged breakpoint are written back as they were');
    assert.equal(total(out, 640), 0, 'no phone condition is left at the old width');
    assert.equal(total(out, 720), before.phone);
    assert.equal(total(out, 1024), before.tablet); assert.equal(total(out, 1280), before.wide);
    // Only the files that carry a phone condition (and the widths block, the report and the manifest) differ.
    const carriers = [...files].filter(([p, b]) => /\.css$|^elements\/[^/]+\.js$/.test(p) && conditionsWith(dec.decode(b), 640) > 0).map(([p]) => p);
    assert.deepEqual(changedPaths(files, out), [...new Set([...carriers, 'breakpoints.report.json', 'manifest.json', 'plainkit.css', 'plainkit.min.css'])].sort());
    assert.match(text(out, 'plainkit.css'), /--pk-bp-phone:720px;--pk-bp-tablet:1024px;--pk-bp-wide:1280px/);
    assert.match(text(out, 'plainkit.min.css'), /--pk-bp-phone:720px/);
    // a rewritten element differs from the shipped one only in the digits of its conditions
    const el = carriers.find(p => p.startsWith('elements/'));
    assert.equal(text(out, el), text(files, el).replaceAll('max-width: 640px', 'max-width: 720px').replaceAll('min-width: 641px', 'min-width: 721px'));
    const report = JSON.parse(text(out, 'breakpoints.report.json'));
    assert.equal(report.byBreakpoint.phone.width, 720); assert.equal(report.breakpoints[0].width, 720);
});

test('a new width that equals another old one is not rewritten twice (one pass, no chaining)', async () => {
    const files = load();
    const before = { phone: total(files, 640), tablet: total(files, 1024) };
    const { files: out } = await customizeDist(files, { include: { breakpoints: true }, breakpoints: { phone: 1024, tablet: 1500, wide: 1600 } });
    assert.equal(total(out, 1500), before.tablet);
    assert.equal(total(out, 1024), before.phone, 'the old tablet conditions moved on to 1500; the 1024 ones now are the phone ones');
    assert.equal(total(out, 640), 0);
});

test('theme and breakpoints are independent: each alone, and together', async () => {
    const files = load();
    const bp = { include: { theme: false, breakpoints: true }, breakpoints: { ...DEFAULTS, phone: 700, wide: 1400 }, theme };
    const th = { include: { theme: true, breakpoints: false }, breakpoints: { ...DEFAULTS, phone: 700, wide: 1400 }, theme };
    const both = { include: { theme: true, breakpoints: true }, breakpoints: bp.breakpoints, theme };
    const a = (await customizeDist(files, bp)).files, b = (await customizeDist(files, th)).files, c = (await customizeDist(files, both)).files;
    // breakpoints only: the theme is nowhere; theme only: no width moved and only the two page stylesheets and the manifest differ
    assert.ok(![...a.values()].some(v => dec.decode(v).includes('#123456')), 'no theme in a breakpoints-only export');
    assert.deepEqual(changedPaths(files, b), ['manifest.json', 'plainkit.css', 'plainkit.min.css']);
    assert.equal(readShippedBreakpoints(text(b, 'plainkit.css')).phone, 640);
    assert.equal(total(b, 640), total(files, 640), 'a theme-only export leaves every breakpoint condition alone');
    assert.match(text(b, 'plainkit.css'), /--color-accent: #123456;/); assert.match(text(b, 'plainkit.min.css'), /--color-accent:#123456;/);
    // both: everything either alone changed, and the page sheets carry both
    assert.deepEqual(changedPaths(files, c), [...new Set([...changedPaths(files, a), ...changedPaths(files, b)])].sort());
    assert.match(text(c, 'plainkit.css'), /--pk-bp-phone:700px[\s\S]*--color-accent: #123456;/);
    for (const p of [...files.keys()].filter(p => !['plainkit.css', 'plainkit.min.css', 'manifest.json'].includes(p))) assert.ok(same(c.get(p), a.get(p)), `${p} in both equals breakpoints only`);
    assert.equal(text(c, 'plainkit.css').replace(text(a, 'plainkit.css'), ''), text(b, 'plainkit.css').replace(text(files, 'plainkit.css'), '').replace(/^/, ''), 'the theme block added is the same one');
    // the theme keeps the file's line endings
    assert.ok(!/[^\r]\n/.test(text(b, 'plainkit.css').slice(text(files, 'plainkit.css').length)), 'the appended block is CRLF like the file');
});

test('the manifest is recomputed: every hash matches the bundle, the manifest lists everything but itself', async () => {
    const files = load();
    const { files: out } = await customizeDist(files, { include: { theme: true, breakpoints: true }, breakpoints: { ...DEFAULTS, tablet: 1100 }, theme });
    const manifest = JSON.parse(text(out, 'manifest.json'));
    assert.equal(manifest.version, shippedManifest.version);
    assert.deepEqual(manifest.files.map(f => f.path), [...out.keys()].filter(p => p !== 'manifest.json').sort());
    for (const f of manifest.files) {
        const bytes = Buffer.from(out.get(f.path));
        assert.equal(f.bytes, bytes.length, f.path);
        assert.equal(f.integrity, 'sha384-' + crypto.createHash('sha384').update(bytes).digest('base64'), f.path);
    }
    const changed = manifest.files.filter(f => shippedManifest.files.find(s => s.path === f.path)?.integrity !== f.integrity).map(f => f.path);
    assert.ok(changed.includes('plainkit.css') && changed.includes('breakpoints.report.json') && !changed.includes('icons.svg'));
    assert.match(manifest.provenance, /Customised export of Plainkit/);
    assert.equal(await integrityOf(enc.encode('abc')), 'sha384-' + crypto.createHash('sha384').update('abc').digest('base64'));
    // the build uses the same function: the shipped manifest text is what manifestText makes of the shipped files
    assert.equal(manifestText({ version: shippedManifest.version, files: shippedManifest.files }).replace(/\n/g, '\r\n'), fs.readFileSync(dist + 'manifest.json', 'utf8'));
});

test('nothing is rewritten silently: an unrecognised or missing width is an error', async () => {
    const files = load();
    const r = rewriteMedia('@media (width <= 640px) { a { b: c } }', DEFAULTS, { ...DEFAULTS, phone: 700 });
    assert.equal(r.unhandled.length, 1); assert.equal(r.counts.phone, 0);
    const tricky = new Map(files); tricky.set('elements/button.js', enc.encode('const css = "@media (width <= 640px){a{b:c}}";'));
    await assert.rejects(customizeDist(tricky, { include: { breakpoints: true }, breakpoints: { ...DEFAULTS, phone: 700 } }), /cannot rewrite 1 media condition/);
    const none = new Map([...files].filter(([p]) => !/^elements\//.test(p) && !/\.css$/.test(p) || p === 'plainkit.css'));
    none.set('plainkit.css', enc.encode(':root{--pk-bp-phone:640px;--pk-bp-tablet:1024px;--pk-bp-wide:1280px}'));
    await assert.rejects(customizeDist(none, { include: { breakpoints: true }, breakpoints: { ...DEFAULTS, phone: 700 } }), /phone breakpoint \(640px\) was found in no @media/);
    assert.deepEqual(rewriteProperties(':root{--pk-bp-phone:640px}', { phone: 700 }), { text: ':root{--pk-bp-phone:700px}', count: 1 });
    // a comment that mentions a media query is not a condition; other widths are left alone
    assert.equal(rewriteMedia('/* @media (max-width: 640px) { */ @media (max-width: 500px) {}', DEFAULTS, { ...DEFAULTS, phone: 700 }).text, '/* @media (max-width: 640px) { */ @media (max-width: 500px) {}');
    assert.equal(rewriteMedia('@media (pointer: coarse), (max-width: 640px) and (orientation: portrait) {}', DEFAULTS, { ...DEFAULTS, phone: 700 }).text, '@media (pointer: coarse), (max-width: 700px) and (orientation: portrait) {}');
});

test('hostile theme input is refused, never written', async () => {
    const files = load();
    for (const css of [':root { --a: url(x); }\n', 'body { color: red }\n', ':root,\n[data-theme="dark"] {\n    --a: 1px;\n}\n</style><script>alert(1)</script>', ':root,\n[data-theme="dark"] {\n    --a: 1px; } body { x: y;\n}\n', ':root,\n[data-theme="dark"] {\n    --a: red; /* c */\n}\n']) {
        assert.ok(themeCssProblem(css), css);
        await assert.rejects(customizeDist(files, { include: { theme: true }, breakpoints: DEFAULTS, theme: { css } }));
        assert.throws(() => themeBundle({ version: '1', theme: { overrides: {}, css } }));
    }
    assert.equal(themeCssProblem(theme.css), null); assert.equal(themeCssProblem(''), null);
});

// An independent reader: the central directory, then each entry's data by its local header. Checks the CRC against gzip's (which carries the CRC-32 of its input).
function unzip(bytes) {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let end = bytes.length - 22; while (v.getUint32(end, true) !== 0x06054b50) end--;
    const n = v.getUint16(end + 10, true); let at = v.getUint32(end + 16, true);
    const out = new Map();
    for (let i = 0; i < n; i++) {
        assert.equal(v.getUint32(at, true), 0x02014b50);
        const method = v.getUint16(at + 10, true), crc = v.getUint32(at + 16, true), size = v.getUint32(at + 24, true), nameLen = v.getUint16(at + 28, true), off = v.getUint32(at + 42, true);
        const name = dec.decode(bytes.subarray(at + 46, at + 46 + nameLen)); at += 46 + nameLen;
        assert.equal(method, 0, 'stored');
        assert.equal(v.getUint32(off, true), 0x04034b50);
        const start = off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true);
        const data = bytes.slice(start, start + size);
        const gz = zlib.gzipSync(data); assert.equal(gz.readUInt32LE(gz.length - 8), crc, `${name} crc`);
        out.set(name, data);
    }
    return out;
}

test('the zip writer: entries come back exactly, names are UTF-8, it is deterministic, and it refuses unsafe paths', () => {
    const entries = [{ path: 'a/b.txt', data: enc.encode('hello\r\nworld') }, { path: 'eé.bin', data: Uint8Array.from({ length: 70000 }, (_, i) => i % 251) }, { path: 'empty', data: new Uint8Array(0) }];
    const zip = zipStore(entries);
    const back = unzip(zip);
    assert.deepEqual([...back.keys()], entries.map(e => e.path));
    for (const e of entries) assert.ok(same(back.get(e.path), e.data), e.path);
    assert.ok(same(zip, zipStore(entries)), 'the same input, the same bytes');
    assert.equal(crc32(enc.encode('123456789')), 0xcbf43926);
    for (const path of ['../x', '/x', 'a\\b', 'a/../b', '']) assert.throws(() => zipStore([{ path, data: new Uint8Array(1) }]), /unsafe path/);
});

test('a full export unzips to the dist layout with the settings and a README that name the version and the settings used', async () => {
    const { files, summary } = await buildBundle(load(), { include: { theme: true, breakpoints: true }, breakpoints: { phone: 700, tablet: 1100, wide: 1500 }, theme });
    const back = unzip(zipStore([...files].map(([path, data]) => ({ path, data }))));
    assert.ok(back.has('dist/plainkit.css') && back.has('dist/elements/button.js') && back.has('dist/manifest.json') && back.has('plainkit.custom.json') && back.has('README.md'));
    const readme = dec.decode(back.get('README.md'));
    assert.match(readme, new RegExp(`based on ${shippedManifest.version.replaceAll('.', '\\.')}`));
    assert.match(readme, /phone 700px, tablet 1100px, wide 1500px \(the release ships phone 640px, tablet 1024px, wide 1280px\)/);
    assert.match(readme, /3 token overrides/);
    const settings = readSettings(dec.decode(back.get('plainkit.custom.json')), NAMES);
    assert.deepEqual(settings.settings, { baseVersion: shippedManifest.version, include: { theme: true, breakpoints: true }, breakpoints: { phone: 700, tablet: 1100, wide: 1500 }, theme: overrides });
    assert.equal(summary.fileCount, shippedManifest.files.length + 1);
    assert.ok(same(back.get('dist/icons.svg'), load().get('icons.svg')), 'an untouched file is the shipped one');
});

test('theme only is small and needs no dist: the CSS, the settings and a README with the link and the Blazor way', () => {
    const out = exportTheme({ version: '9.9.9', theme, shipped: DEFAULTS });
    const back = unzip(out.zip);
    assert.deepEqual([...back.keys()].sort(), ['README.md', 'plainkit-theme.css', 'plainkit.custom.json']);
    assert.ok(out.zip.length < 8000);
    assert.equal(out.name, 'plainkit-theme-9.9.9.zip');
    assert.match(dec.decode(back.get('plainkit-theme.css')), /^\/\* Plainkit theme: 3 token overrides[^\n]*\n:root,\n\[data-theme="dark"\] \{[\s\S]*--color-accent: #123456;/);
    const readme = dec.decode(back.get('README.md'));
    assert.match(readme, /<link rel="stylesheet" href="plainkit-theme\.css">/); assert.match(readme, /Blazor: copy the file to `wwwroot\/plainkit-theme\.css`/);
    assert.match(readme, /Breakpoints: not included/);
    const s = readSettings(dec.decode(back.get('plainkit.custom.json')), NAMES).settings;
    assert.deepEqual(s.include, { theme: true, breakpoints: false }); assert.equal(s.breakpoints, null); assert.deepEqual(s.theme, overrides);
});

test('settings files re-import; a hostile or wrong one is refused value by value', () => {
    const text1 = settingsText({ version: '1.0.0', include: { theme: true, breakpoints: true }, breakpoints: { phone: 700, tablet: 1100, wide: 1500 }, theme: overrides });
    assert.deepEqual(readSettings(text1, NAMES).settings.breakpoints, { phone: 700, tablet: 1100, wide: 1500 });
    assert.match(readSettings('{', NAMES).error, /not valid JSON/);
    assert.match(readSettings('{"format":"x"}', NAMES).error, /Not a plainkit\.custom\.json/);
    assert.match(readSettings(JSON.stringify({ format: 'plainkit-custom-sdk', formatVersion: 2 }), NAMES).error, /Unsupported/);
    assert.match(readSettings(JSON.stringify({ format: 'plainkit-custom-sdk', formatVersion: 1, include: { breakpoints: true }, breakpoints: { phone: 5, tablet: 1024, wide: 1280 } }), NAMES).error, /not valid: phone must be between/);
    const hostile = readSettings(JSON.stringify({ format: 'plainkit-custom-sdk', formatVersion: 1, include: { theme: true }, theme: { shared: { '--x': 'url(http://evil)', 'bad name': '1', '--ok': '2px' }, __proto__: { polluted: true } } }), NAMES).settings;
    assert.deepEqual(hostile.theme, { shared: { '--ok': '2px' }, dark: {}, light: {} });
    assert.equal({}.polluted, undefined);
});

test('the delta table: what moves at each breakpoint, and the widths whose state flips', () => {
    const report = JSON.parse(fs.readFileSync(dist + 'breakpoints.report.json', 'utf8'));
    const rows = deltaRows(report, { ...DEFAULTS, phone: 700, wide: 1280 });
    const phone = rows.find(r => r.name === 'phone');
    assert.deepEqual([phone.from, phone.to, phone.changed, phone.flips], [640, 700, true, [641, 700]]);
    assert.ok(phone.elements.length > 40 && phone.rules > 90);
    assert.ok(phone.elements.every(e => e.below.length + e.above.length > 0));
    const tablet = rows.find(r => r.name === 'tablet');
    assert.deepEqual([tablet.changed, tablet.flips], [false, null]);
    assert.equal(deltaRows(report, { phone: 600, tablet: 1024, wide: 1280 })[0].flips.join(), '601,640');
});

test('fetchDist reads the manifest and every file, verifies each hash, and refuses a substituted file, an error status and an unsafe path', async () => {
    const files = load();
    const serve = (over = {}) => async url => {
        const p = new URL(url).pathname.replace(/^\/dist\//, '');
        const body = over[p] ?? files.get(p);
        return body === undefined ? { ok: false, status: 404 } : { ok: true, status: 200, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) };
    };
    const got = await fetchDist('http://localhost/dist/', { fetchImpl: serve(), concurrency: 4 });
    assert.equal(got.version, shippedManifest.version); assert.equal(got.files.size, files.size); assert.ok(got.report.byBreakpoint.phone);
    const exp = await exportSdk({ dist: got, include: { theme: false, breakpoints: true }, breakpoints: { ...DEFAULTS, phone: 700 } });
    assert.ok(unzip(exp.zip).has('dist/manifest.json')); assert.equal(exp.name, `plainkit-custom-${shippedManifest.version}.zip`);
    await assert.rejects(fetchDist('http://localhost/dist/', { fetchImpl: serve({ 'plainkit.css': enc.encode('x') }) }), /plainkit\.css: does not match its hash/);
    await assert.rejects(fetchDist('http://localhost/dist/', { fetchImpl: async () => ({ ok: false, status: 500 }) }), /manifest\.json: 500/);
    const evil = enc.encode(JSON.stringify({ version: '1', files: [{ path: '../secret', bytes: 1, integrity: 'x' }] }));
    await assert.rejects(fetchDist('http://localhost/dist/', { fetchImpl: serve({ 'manifest.json': evil }) }), /unsafe path/);
});
