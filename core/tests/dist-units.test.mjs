// The two units of dist/ (issue 162): the runtime SDK (dist/, without modules/) and the dev-tool modules (dist/modules/), each with its own manifest and SRI hashes.
// The runtime holds no module folder and imports nothing from the modules, so a page that only uses pk-* elements never fetches a module; the modules unit is exactly the
// module folders and reaches the runtime only through its documented relative paths.
import './needs-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../tools/build.mjs';
import { MODULES } from '../tools/modules-dist.mjs';

const core = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { out } = build({ write: false });
const sri = bytes => 'sha384-' + crypto.createHash('sha384').update(bytes).digest('base64');
const manifest = f => JSON.parse(out.get(f));
const runtime = manifest('dist/manifest.json');
const modules = manifest('dist/modules/manifest.json');
const modulesFolders = Object.keys(MODULES).sort();

test('the runtime manifest lists no module and no module folder sits in dist/', () => {
    assert.ok(runtime.files.length > 100);
    assert.deepEqual(runtime.files.filter(f => f.path === 'modules' || f.path.startsWith('modules/')), []);
    assert.deepEqual(runtime.files.filter(f => modulesFolders.includes(f.path.split('/')[0])), [], 'a module folder next to js/ is the old layout');
    const top = new Set([...out.keys()].filter(f => f.startsWith('dist/')).map(f => f.split('/')[1]));
    for (const name of modulesFolders) assert.ok(!top.has(name), `dist/${name} is a module folder in the runtime`);
    assert.equal(runtime.name, 'plainkit');
    assert.ok(!runtime.requires);
});

test('the modules unit is exactly the module folders, and its manifest is its own', () => {
    assert.equal(modules.name, 'plainkit-modules');
    assert.equal(modules.version, runtime.version);
    assert.match(modules.requires, /^plainkit \d/);
    const folders = [...new Set(modules.files.map(f => f.path.split('/')[0]))].sort();
    assert.deepEqual(folders, modulesFolders);
    assert.ok(modules.files.every(f => f.path.includes('/')), 'every file is inside a module folder');
    const onDisk = [...out.keys()].filter(f => f.startsWith('dist/modules/') && f !== 'dist/modules/manifest.json').map(f => f.slice('dist/modules/'.length)).sort();
    assert.deepEqual(modules.files.map(f => f.path), onDisk);
    for (const name of modulesFolders) assert.ok(modules.files.some(f => f.path === `${name}/${name}.js`), `${name}/${name}.js`);
});

test('each manifest verifies: every listed file exists in the build with the listed size and SRI hash, and no file is unlisted', () => {
    for (const [m, prefix, own] of [[runtime, 'dist/', f => !f.startsWith('dist/modules/') && f !== 'dist/manifest.json'], [modules, 'dist/modules/', f => f.startsWith('dist/modules/') && f !== 'dist/modules/manifest.json']]) {
        const listed = new Set();
        for (const f of m.files) {
            listed.add(prefix + f.path);
            const text = out.get(prefix + f.path);
            const bytes = text !== undefined ? Buffer.from(text) : fs.readFileSync(path.join(core, prefix + f.path)); // dist/skills is written by scripts/build-skills.mjs
            assert.equal(bytes.length, f.bytes, f.path);
            assert.equal(sri(bytes), f.integrity, f.path);
        }
        for (const f of [...out.keys()].filter(f => f.startsWith('dist/') && own(f))) assert.ok(listed.has(f), `${f} is not in its manifest`);
    }
});

test('the manifests on disk are what the build makes', () => {
    for (const f of ['dist/manifest.json', 'dist/modules/manifest.json']) assert.equal(fs.readFileSync(path.join(core, f), 'utf8'), out.get(f), `${f} is stale: run node scripts/bootstrap.mjs`);
});

// The import graph of what a consumer page loads: dist/plainkit.js (the entry), every element module and what they import, statically or with a literal import().
const specs = text => [...text.matchAll(/(?:\bfrom|\bimport\s*\(?)\s*['"](\.{1,2}\/[^'"]+)['"]/g)].map(m => m[1]);
const resolve = (from, spec) => path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
function reach(starts) {
    const seen = new Set(); const todo = [...starts];
    while (todo.length) {
        const f = todo.pop();
        if (seen.has(f) || !out.has(f) || !f.endsWith('.js')) continue;
        seen.add(f);
        for (const s of specs(out.get(f))) todo.push(resolve(f, s));
    }
    return seen;
}

test('a page that uses only runtime elements never fetches a module: nothing reachable from the entry or an element imports dist/modules', () => {
    const starts = ['dist/plainkit.js', 'dist/js/plainkit.js', 'dist/js/loader.js', ...[...out.keys()].filter(f => /^dist\/elements\/[^/]+\.js$/.test(f))];
    const seen = reach(starts);
    assert.ok(seen.size > 90, `only ${seen.size} files reached`);
    assert.deepEqual([...seen].filter(f => f.startsWith('dist/modules/')), []);
    const registry = JSON.parse(out.get('dist/elements/registry.js').replace(/^[\s\S]*?export default /, '').replace(/;\s*$/, ''));
    assert.ok(Object.values(registry).every(p => !/modules/.test(p)), 'no element is a module');
});

test('no runtime file imports a module (only the gallery boot for the code explorer names the modules unit, and it loads only when a sample asks for it)', () => {
    const offenders = [];
    for (const f of [...out.keys()].filter(f => f.startsWith('dist/') && !f.startsWith('dist/modules/') && f.endsWith('.js')))
        for (const s of specs(out.get(f))) if (resolve(f, s).startsWith('dist/modules/')) offenders.push(`${f} -> ${s}`);
    assert.deepEqual(offenders, ['dist/gallery/boots/code-explorer.js -> ../../modules/code-explorer/element.js', 'dist/gallery/boots/code-explorer.js -> ../../modules/code-explorer/providers.js']);
    assert.ok(!out.has('dist/js/code-explorer/element.js'), 'the old re-export shims stay out of the runtime');
});

test('the modules unit needs the runtime only through js/ and the runtime assets it names, and the runtime never needs the modules', () => {
    const problems = [];
    for (const f of [...out.keys()].filter(f => f.startsWith('dist/modules/') && f.endsWith('.js')))
        for (const s of specs(out.get(f))) { const t = resolve(f, s); if (!out.has(t)) problems.push(`${f} -> ${s}`); else if (!t.startsWith('dist/modules/') && !t.startsWith('dist/js/')) problems.push(`${f} -> ${s} (outside modules/ and js/)`); }
    assert.deepEqual(problems, []);
});

test('the npm package ships the runtime unit only', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(core, 'package.json'), 'utf8'));
    assert.deepEqual(pkg.files.slice(0, 2), ['dist', '!dist/modules']);
});

test('the build removes the module folders of the old layout (dist/<name>/) and stale files under dist/modules', async () => {
    const { staleDistModules } = await import('../tools/build.mjs');
    const dir = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TEMP ?? '/tmp'), 'pk-units-'));
    try {
        for (const f of ['dist/theme-editor/theme-editor.js', 'dist/modules/theme-editor/old.js', 'dist/modules/theme-editor/theme-editor.js', 'dist/js/x.js']) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), ''); }
        assert.deepEqual(staleDistModules(new Map([['dist/modules/theme-editor/theme-editor.js', '']]), dir), ['dist/modules/theme-editor/old.js', 'dist/theme-editor/theme-editor.js']);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
