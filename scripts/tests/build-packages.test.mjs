// scripts/build-packages.mjs assembles the packages of packages.json (phase 1, #1656): the zips hold exactly what the declaration says, with manifests and the version,
// together they are the whole of core/dist, and the release and Pages steps can be run locally. Run: node --test scripts/tests/build-packages.test.mjs
import '../../core/tests/needs-bootstrap.mjs';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeTempDir } from '../../core/tools/tempdir.mjs';
import { REPO, CORE_ID, loadPackages, distFiles } from '../packages.mjs';
import { plan, write, zipName, manifestName, readVersion } from '../build-packages.mjs';
import { checkPackageZips, listZip, readEntry } from '../check-package.mjs';

const tmp = makeTempDir('pk-pkgtest-');
const zips = path.join(tmp, 'zips'), zips2 = path.join(tmp, 'zips2');
const version = readVersion(REPO);
const { packages } = loadPackages();
let report;
before(async () => { report = await write({ outDir: path.join(tmp, 'folders'), zipDir: zips }); await write({ zipDir: zips2 }); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const names = id => listZip(fs.readFileSync(path.join(zips, zipName(id, version)))).map(e => e.name);

test('core, tools, audit and canvas are built, each with a zip and a manifest asset named by the id and the version', () => {
    assert.deepEqual(report.map(r => r.id), ['plainkit', 'plainkit.tools', 'plainkit.audit', 'plainkit.markdown', 'plainkit.dock', 'plainkit.canvas', 'plainkit.ide']);
    assert.equal(zipName('plainkit', version), `plainkit-${version}.zip`);
    assert.equal(zipName('plainkit.tools', version), `plainkit.tools-${version}.zip`);
    for (const r of report) { assert.ok(fs.existsSync(path.join(zips, zipName(r.id, version)))); assert.ok(fs.existsSync(path.join(zips, manifestName(r.id, version)))); }
});

test('the checker passes on freshly built zips', async () => assert.deepEqual(await checkPackageZips(zips), []));

test('the union of the package zips is the release: the dist zip (dist/ without modules/) and the modules zip, every file once', () => {
    const union = [...names('plainkit'), ...names('plainkit.tools'), ...names('plainkit.audit'), ...names('plainkit.markdown'), ...names('plainkit.dock'), ...names('plainkit.canvas'), ...names('plainkit.ide')].filter(n => !n.endsWith('.manifest.json') || !/^plainkit(\.[a-z]+)?\.manifest\.json$/.test(n));
    assert.equal(new Set(union).size, union.length, 'no file is in two zips');
    const distZip = distFiles(path.join(REPO, 'core', 'dist')).filter(f => !f.startsWith('modules/'));
    const modulesZip = distFiles(path.join(REPO, 'core', 'dist')).filter(f => f.startsWith('modules/'));
    assert.deepEqual([...union].sort(), [...distZip, ...modulesZip].sort());
});

test('tools holds the dev-tool modules and the helper files, and core holds none of them', () => {
    const tools = loadPackages().byId.get('plainkit.tools');
    const t = new Set(names('plainkit.tools')), c = new Set(names('plainkit'));
    for (const f of tools.js) { assert.ok(t.has(`js/${f}`), `tools lacks js/${f}`); assert.ok(!c.has(`js/${f}`), `core still holds js/${f}`); }
    for (const m of tools.modules) assert.ok(t.has(`modules/${m}/${m}.js`) || [...t].some(n => n.startsWith(`modules/${m}/`)), `tools lacks module ${m}`);
    assert.ok(![...c].some(n => n.startsWith('modules/')), 'core holds no module');
    assert.ok(t.has('modules/manifest.json') && t.has('plainkit.tools.manifest.json'));
    assert.ok(c.has('manifest.json') && c.has('manifest.extras.json') && c.has('plainkit.manifest.json'));
});

test("core's manifest.extras.json lists only files that core's zip holds; the full dist/manifest.extras.json still lists the helpers", () => {
    const buf = fs.readFileSync(path.join(zips, zipName('plainkit', version)));
    const e = listZip(buf).find(x => x.name === 'manifest.extras.json');
    const listed = JSON.parse(readEntry(buf, e).toString('utf8')).files.map(f => f.path);
    const c = new Set(names('plainkit'));
    assert.deepEqual(listed.filter(p => !c.has(p)), []);
    const full = JSON.parse(fs.readFileSync(path.join(REPO, 'core', 'dist', 'manifest.extras.json'), 'utf8')).files.map(f => f.path);
    assert.ok(full.includes('js/custom-sdk.js'), 'the full dist keeps every old path (FULL is first class)');
});

test('audit holds the CLI, its rules and the strict engine, runs on its own from the unzipped folder, and core holds none of it', async () => {
    const a = new Set(names('plainkit.audit')), c = new Set(names('plainkit'));
    for (const f of ['audit.mjs', 'tools/audit/cli.mjs', 'tools/audit/rules.mjs', 'tools/audit/scanners/literals.mjs', 'tools/strict/engine.mjs', 'plainkit.audit.manifest.json']) assert.ok(a.has(f), `audit lacks ${f}`);
    assert.ok([...c].every(f => !f.startsWith('tools/audit/') && !f.startsWith('tools/strict/') && f !== 'audit.mjs'), 'core still holds audit files');
    assert.ok(c.has('tools/plainkit-cli.mjs'), 'core keeps the bin stub');
    const dir = path.join(tmp, 'audit-run');
    await write({ outDir: dir });
    const r = spawnSync(process.execPath, [path.join(dir, 'plainkit.audit', 'audit.mjs'), '--version'], { encoding: 'utf8', cwd: dir });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, new RegExp(version.replace(/\./g, '\.')));
});

test('canvas holds pk-canvas, its viewport and logic helpers and the SVG toolkit, and core holds none of them', () => {
    const canvas = loadPackages().byId.get('plainkit.canvas');
    const k = new Set(names('plainkit.canvas')), c = new Set(names('plainkit'));
    assert.ok(k.has('elements/canvas.js') && !c.has('elements/canvas.js'), 'pk-canvas lives in plainkit.canvas only');
    for (const f of ['js/viewport-logic.js', 'js/canvas-select.js', 'js/svg/model.js', 'js/svg/path.js']) assert.ok(k.has(f) && !c.has(f), `${f} lives in plainkit.canvas only`);
    assert.ok([...c].every(n => !n.startsWith('js/svg/') && !/^js\/canvas-/.test(n)), 'no canvas helper left in core');
    assert.ok(k.has('plainkit.canvas.manifest.json') && !k.has('manifest.json'));
    for (const f of canvas.js.filter(x => !x.endsWith('/'))) assert.ok(k.has(`js/${f}`), `canvas lacks js/${f}`);
});

test('dock holds pk-dock and js/dock-*.js, and core holds none of them', () => {
    const k = new Set(names('plainkit.dock')), c = new Set(names('plainkit'));
    for (const f of ['elements/dock.js', 'js/dock-drag.js', 'js/dock-model.js', 'js/dock-tree.js']) assert.ok(k.has(f) && !c.has(f), `${f} lives in plainkit.dock only`);
    assert.ok(k.has('plainkit.dock.manifest.json') && !k.has('manifest.json'));
});

test('markdown holds pk-markdown, pk-markdown-editor and js/markdown/, and core holds none of them', () => {
    const k = new Set(names('plainkit.markdown')), c = new Set(names('plainkit'));
    for (const f of ['elements/markdown.js', 'elements/markdown-editor.js', 'js/markdown/parse.js', 'js/markdown/render.js', 'js/markdown/commands.js']) assert.ok(k.has(f) && !c.has(f), `${f} lives in plainkit.markdown only`);
    assert.ok(k.has('plainkit.markdown.manifest.json') && !k.has('manifest.json'));
});

test('ide holds the editor and IDE metadata, core holds none of it, and core/package.json neither exports nor packs it', () => {
    const k = new Set(names('plainkit.ide')), c = new Set(names('plainkit'));
    const ide = loadPackages().byId.get('plainkit.ide').files;
    for (const f of ide) assert.ok(k.has(f) && !c.has(f), `${f} lives in plainkit.ide only`);
    assert.ok(k.has('elements.d.ts') && k.has('web-types.json') && k.has('plainkit.ide.manifest.json') && !k.has('manifest.json'));
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'core', 'package.json'), 'utf8'));
    assert.deepEqual(pkg.files.filter(f => ide.some(i => f === `!dist/${i}`)).sort(), ide.map(i => `!dist/${i}`).sort(), 'FIX: core/package.json "files" negates each editor file of plainkit.ide.');
    assert.ok(!JSON.stringify(pkg.exports).match(/custom-elements|web-types/), 'FIX: core/package.json "exports" may not point at files the package leaves out.');
});

test('the npm package model leaves exactly the files of the built packages out of core (core/package.json files)', () => {
    const files = JSON.parse(fs.readFileSync(path.join(REPO, 'core', 'package.json'), 'utf8')).files;
    const out = loadPackages().packages.filter(p => p.built && p.id !== CORE_ID);
    const negated = files.filter(f => f.startsWith('!dist/js/')).map(f => f.slice('!dist/js/'.length)).sort();
    assert.deepEqual(negated, out.flatMap(p => (p.js ?? []).map(f => f.replace(/\/$/, ''))).sort(), 'FIX: core/package.json "files" negates each js file (or folder) of the built packages, and nothing else under dist/js.');
    assert.deepEqual(files.filter(f => f.startsWith('!dist/elements/') && f.endsWith('.js')).sort(), out.flatMap(p => (p.elements ?? []).map(t => `!dist/elements/${t.replace(/^pk-/, '')}.js`)).sort(), 'FIX: core/package.json "files" negates the element module of each element of the built packages.');
    assert.ok(files.includes('!dist/modules'));
});

test('a build is reproducible: the same sources give the same zip bytes', () => {
    for (const r of report) assert.ok(fs.readFileSync(path.join(zips, zipName(r.id, version))).equals(fs.readFileSync(path.join(zips2, zipName(r.id, version)))), `${r.id} differs between two builds`);
});

test('the ceilings of every built package are set and respected (they only go down)', () => {
    for (const r of report) {
        const p = packages.find(x => x.id === r.id);
        if (r.id !== CORE_ID) { assert.ok(Number.isInteger(p.maxZipBytes) && Number.isInteger(p.maxUnpackedBytes), `${r.id} needs maxZipBytes and maxUnpackedBytes (measured plus 1 percent)`); assert.ok(r.zipBytes <= p.maxZipBytes && r.rawBytes <= p.maxUnpackedBytes, `${r.id} over its ceiling`); }
    }
});

test('the checker catches a missing file, a changed byte, a wrong version and a lost manifest', async () => {
    const bad = path.join(tmp, 'bad');
    fs.cpSync(zips, bad, { recursive: true });
    const z = path.join(bad, zipName('plainkit.tools', version));
    const buf = fs.readFileSync(z);
    const first = listZip(buf)[0];
    buf[first.offset + 30 + Buffer.byteLength(first.name) + 2] ^= 0xff; // inside the first entry's data: breaks its inflate or its hash
    fs.writeFileSync(z, buf);
    let problems;
    try { problems = await checkPackageZips(bad); } catch { problems = ['unreadable']; }
    assert.ok(problems.length > 0, 'a damaged zip is reported');
    fs.copyFileSync(path.join(zips, zipName('plainkit.tools', version)), z); // undamaged again
    fs.rmSync(path.join(bad, manifestName('plainkit', version)));
    assert.ok((await checkPackageZips(bad)).some(p => p.includes('missing')), 'a missing manifest asset is reported');
    fs.rmSync(path.join(bad, zipName('plainkit', version)));
    assert.ok((await checkPackageZips(bad)).some(p => p.includes('plainkit: missing')));
});

test('the Pages step copies every extra to packages/<id>/ (core stays dist/) and the CLI works', () => {
    const site = path.join(tmp, 'site');
    const r = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'build-packages.mjs'), '--pages', site], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(fs.existsSync(path.join(site, 'packages', 'plainkit.tools', 'plainkit.tools.manifest.json')));
    assert.ok(fs.existsSync(path.join(site, 'packages', 'plainkit.tools', 'js', 'custom-sdk.js')));
    assert.ok(!fs.existsSync(path.join(site, 'packages', 'plainkit')), 'core is served as dist/, not duplicated');
    const c = spawnSync(process.execPath, [path.join(REPO, 'scripts', 'check-package.mjs'), '--zips', zips], { encoding: 'utf8' });
    assert.equal(c.status, 0, c.stderr + c.stdout);
    assert.ok(plan().built.has('plainkit.tools'));
    assert.ok(fs.existsSync(path.join(site, 'packages', 'plainkit.audit', 'audit.mjs')));
});
