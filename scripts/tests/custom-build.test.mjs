// scripts/custom-build.mjs (#124 step 4): the CLI bundle and the browser export are the same bytes; bad input fails with one clear line and exit code 1.
import '../../core/tests/needs-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fetchDist, exportSdk } from '../../core/js/custom-sdk.js';
import { settingsText } from '../../core/js/custom-sdk-files.js';
import { buildOverrides } from '../../core/js/theme.js';
import { buildFromSettings, parseArgs, DEFAULT_DIST } from '../custom-build.mjs';

const cli = fileURLToPath(new URL('../custom-build.mjs', import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-custom-build-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const overrides = { shared: { '--radius-md': '2px' }, dark: { '--color-accent': '#123456' }, light: { '--color-accent': '#654321' } };
const theme = { overrides, css: buildOverrides(overrides).css };
const extras = [{ name: 'laptop', width: 1700 }, { name: 'watch', width: 360 }];
const write = (name, text) => { const f = path.join(tmp, name); fs.writeFileSync(f, text); return f; };
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });

test('the CLI zip equals the browser export byte for byte (own breakpoints, icons left out)', async () => {
    const include = { theme: true, breakpoints: true, icons: false };
    const widths = { phone: 700, tablet: 1100, wide: 1400 };
    const config = write('a.json', settingsText({ version: '0', include, breakpoints: widths, theme: overrides, extras }));
    // The browser path: fetchDist over the same folder through a fetch of its own, then exportSdk, as the Custom SDK tab calls them.
    const dist = await fetchDist(pathToFileURL(path.resolve(DEFAULT_DIST) + path.sep), { fetchImpl: async u => { const f = fileURLToPath(u); if (!fs.existsSync(f)) return { ok: false, status: 404 }; const b = fs.readFileSync(f); return { ok: true, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }; } });
    const browser = await exportSdk({ dist, include, breakpoints: widths, theme, extras });
    const out = path.join(tmp, 'a.zip');
    const r = run('--config', config, '--out', out);
    assert.equal(r.status, 0, r.stderr);
    const cliZip = fs.readFileSync(out);
    assert.equal(cliZip.length, browser.zip.length);
    assert.ok(Buffer.compare(cliZip, Buffer.from(browser.zip)) === 0, 'the zips differ');
    assert.ok(!cliZip.includes('dist/icons.svg'), 'dist/icons.svg is left out');
    assert.ok(cliZip.includes('plainkit-breakpoints.css'));
    assert.ok(cliZip.includes('ownBreakpoints'));
});

test('theme only and the default name; --check writes nothing', async () => {
    const config = write('t.json', settingsText({ version: '0', include: { theme: true, breakpoints: false }, theme: overrides }));
    const res = await buildFromSettings(fs.readFileSync(config, 'utf8'), DEFAULT_DIST);
    assert.match(res.name, /^plainkit-theme-/);
    const before = fs.readdirSync(tmp).sort();
    const r = run('--config', config, '--check');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /nothing written/);
    assert.deepEqual(fs.readdirSync(tmp).sort(), before);
});

test('bad flags, hostile and malformed configs: exit 1, one clear line', () => {
    const cases = [
        [[], /--config is required/],
        [['--config'], /needs a value/],
        [['--config', 'x', '--nope'], /unknown argument --nope/],
        [['--config', path.join(tmp, 'missing.json')], /is not a file/],
        [['--config', write('big.json', ' '.repeat(1024 * 1024 + 1))], /larger than/],
        [['--config', write('bad.json', '{nope')], /not valid JSON/],
        [['--config', write('arr.json', '[]')], /Not a plainkit\.custom\.json/],
        [['--config', write('ver.json', JSON.stringify({ format: 'plainkit-custom-sdk', formatVersion: 9 }))], /Unsupported settings version 9/],
        [['--config', write('none.json', settingsText({ version: '0', include: { theme: false, breakpoints: false } }))], /nothing is included/],
        [['--config', write('empty.json', settingsText({ version: '0', include: { theme: true, breakpoints: false }, theme: { shared: {}, dark: {}, light: {} } }))], /at least one token override/],
        [['--config', write('bp.json', JSON.stringify({ format: 'plainkit-custom-sdk', formatVersion: 1, include: { breakpoints: true }, breakpoints: { phone: 5000, tablet: 1, wide: 'x' } }))], /breakpoints in the file are not valid/],
        [['--config', write('own.json', JSON.stringify({ format: 'plainkit-custom-sdk', formatVersion: 1, include: { breakpoints: true }, breakpoints: { phone: 640, tablet: 1024, wide: 1280 }, ownBreakpoints: [{ name: '__proto__', width: 500 }] }))], /of your own in the file are not valid/],
        [['--config', write('ok.json', settingsText({ version: '0', include: { theme: false, breakpoints: true }, breakpoints: { phone: 640, tablet: 1024, wide: 1280 } })), '--dist', tmp], /has no manifest\.json/],
        [['--config', write('ok2.json', settingsText({ version: '0', include: { theme: false, breakpoints: true }, breakpoints: { phone: 640, tablet: 1024, wide: 1280 } })), '--out', path.join(tmp, 'x.txt')], /must be a \.zip/],
    ];
    for (const [args, re] of cases) {
        const r = run(...args);
        assert.equal(r.status, 1, `${args.join(' ')}: ${r.stdout}`);
        assert.match(r.stderr, re);
        assert.equal(r.stderr.trim().split('\n').length, 1, 'one line');
        assert.match(r.stderr, /^custom-build: /);
    }
    assert.throws(() => parseArgs(['--config', 'a', '--out']), /needs a value/);
});
