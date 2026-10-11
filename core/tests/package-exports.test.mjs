// The packed package must (1) resolve every target of its `exports` map and (2) survive a bundler: every element module registers itself on
// import, so `sideEffects: false` made esbuild/webpack/Rollup drop `import 'plainkit/elements/button'` (a 0-byte bundle).
// Packs core with `npm pack` into a temp dir, installs it as node_modules/plainkit there and bundles with esbuild. Needs bootstrap (dist).
import './needs-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('every exports target exists, and every pattern matches at least one file', () => {
    const targets = [];
    const walk = v => typeof v === 'string' ? targets.push(v) : Object.values(v).forEach(walk);
    walk(pkg.exports);
    assert.ok(targets.length > 5);
    for (const t of targets) {
        assert.match(t, /^\.\//, `${t} must be package-relative`);
        if (!t.includes('*')) { assert.ok(fs.existsSync(path.join(root, t)), `exports target ${t} does not exist (run node scripts/bootstrap.mjs)`); continue; }
        const [pre, post] = t.split('*');
        const files = fs.readdirSync(path.join(root, path.dirname(pre + 'x')), { recursive: true }).filter(f => String(f).endsWith(post));
        assert.ok(files.length > 0, `exports pattern ${t} matches no file`);
    }
    assert.ok(fs.existsSync(path.join(root, pkg.main)), 'main exists');
});

test('sideEffects names the element modules and CSS, not false', () => {
    assert.ok(Array.isArray(pkg.sideEffects), 'sideEffects: false makes bundlers drop element registrations');
    assert.ok(pkg.sideEffects.some(p => p.includes('dist/elements/')));
    assert.ok(pkg.sideEffects.some(p => p.endsWith('.css')));
});

test('a bundler import of plainkit/elements/button from the packed output registers pk-button', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-exports-'));
    try {
        const packDir = path.join(tmp, 'pack');
        fs.mkdirSync(packDir);
        const win = process.platform === 'win32';
        const packed = spawnSync(win ? 'npm.cmd' : 'npm', ['pack', '--pack-destination', packDir, '--silent'], { cwd: root, encoding: 'utf8', shell: win });
        assert.equal(packed.status, 0, packed.stderr);
        const tgz = path.join(packDir, packed.stdout.trim().split(/\r?\n/).pop());
        const inst = path.join(tmp, 'app', 'node_modules', 'plainkit');
        fs.mkdirSync(inst, { recursive: true });
        const x = spawnSync('tar', ['-xzf', path.relative(inst, tgz).split(path.sep).join('/'), '--strip-components=1'], { cwd: inst, encoding: 'utf8' });
        assert.equal(x.status, 0, x.stderr);
        const out = path.join(tmp, 'bundle.mjs');
        const result = await build({
            stdin: { contents: "import 'plainkit/elements/button';", resolveDir: path.join(tmp, 'app'), sourcefile: 'entry.js' },
            bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
        });
        assert.deepEqual(result.warnings.filter(w => /side effects/.test(w.text)), [], 'esbuild ignored the import as side-effect free');
        assert.ok(fs.statSync(out).size > 2000, 'the bundle is empty: the element import was dropped');
        const run = spawnSync(process.execPath, ['--input-type=module', '-e', `
            class E { addEventListener() {} removeEventListener() {} dispatchEvent() { return true; } }
            globalThis.HTMLElement = E; globalThis.CSSStyleSheet = class { replaceSync() {} };
            globalThis.document = { createElement: () => ({ content: {} }) };
            const tags = []; globalThis.customElements = { define: t => tags.push(t), get: () => undefined };
            await import(${JSON.stringify(pathToFileURL(out).href)});
            console.log(JSON.stringify(tags));`], { encoding: 'utf8' });
        assert.equal(run.status, 0, run.stderr);
        assert.ok(JSON.parse(run.stdout.trim().split(/\r?\n/).pop()).includes('pk-button'), `customElements.define('pk-button') did not run: ${run.stdout}`);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
