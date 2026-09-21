// Generated output is not in git (scripts/generated.mjs lists it, .gitignore ignores it, scripts/bootstrap.mjs writes it). These tests keep the three in
// step and prove the guard rails: no generated path is tracked, the release artefacts are, a missing generated file says "run node scripts/bootstrap.mjs",
// and bootstrap --if-missing is a cheap no-op on a current tree.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { GENERATED_PATTERNS, SENTINELS, BOOTSTRAP_MESSAGE, isGenerated, missingGenerated, requireGenerated, generatedCurrent, root } from '../generated.mjs';
import { STEPS } from '../bootstrap.mjs';

const git = args => spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
const inGit = git(['rev-parse', '--is-inside-work-tree']).status === 0;

test('.gitignore ignores exactly the generated paths listed in scripts/generated.mjs', () => {
    const lines = fs.readFileSync(path.join(root, '.gitignore'), 'utf8').split(/\r?\n/);
    const marker = lines.findIndex(l => l.startsWith('## Generated output: NOT in git'));
    assert.ok(marker >= 0, 'the .gitignore section that points to node scripts/bootstrap.mjs exists');
    assert.ok(lines.slice(marker, marker + 4).some(l => l.includes('node scripts/bootstrap.mjs')), 'the comment names the bootstrap');
    const ignored = lines.slice(marker).filter(l => l.startsWith('/'));
    assert.deepEqual(ignored, GENERATED_PATTERNS.map(([glob]) => glob));
});

test('no tracked file is generated, and the release artefacts and sources are tracked', { skip: !inGit && 'not a git checkout' }, () => {
    const tracked = git(['ls-files']).stdout.split('\n').filter(Boolean);
    assert.deepEqual(tracked.filter(isGenerated), [], 'generated files must not be committed: git rm --cached them (node scripts/generated.mjs list)');
    for (const f of ['core/VERSION', 'core/site/scorecard/api.baseline.json', 'core/tests/browser/report.json', 'core/js/element.js', 'blazor/mappings/button.json', 'scripts/bootstrap.mjs'])
        assert.ok(tracked.includes(f) && !isGenerated(f), `${f} is a tracked source or release artefact`);
});

test('git ignores every generated sample path and none of the tracked sources', { skip: !inGit && 'not a git checkout' }, () => {
    const samples = ['core/dist/manifest.json', 'core/plainkit.css', 'core/elements/elements.css', 'core/elements/registry.js', 'core/elements/button/button.element.js', 'core/js/version.js',
        'core/site/gallery/gallery.data.js', 'core/site/guides/guides.data.js', 'core/site/files/snapshot.json', 'core/site/scorecard/api.current.json', 'blazor/src/PlainKit.Blazor/Generated/PkButton.razor',
        'blazor/src/PlainKit.Blazor/wwwroot/PlainKit.Blazor.lib.module.js', 'blazor/src/PlainKit.Blazor/wwwroot/plainkit/manifest.json'];
    for (const f of samples) { assert.ok(isGenerated(f), `${f} is listed as generated`); assert.equal(git(['check-ignore', '-q', f]).status, 0, `${f} is git-ignored`); }
    for (const f of ['core/site/scorecard/api.baseline.json', 'core/tests/browser/report.json', 'core/VERSION', 'core/elements/button/button.js', 'blazor/src/PlainKit.Blazor/wwwroot/plainkit.blazor.js'])
        assert.equal(git(['check-ignore', '-q', f]).status, 1, `${f} is not ignored`);
});

test('the bootstrap runs build, generate-blazor, build-skills, publish-dist in that order', () => {
    assert.deepEqual(STEPS.map(([f]) => f), ['core/tools/build.mjs', 'scripts/generate-blazor.mjs', 'scripts/build-skills.mjs', 'scripts/publish-dist.mjs']);
    for (const [f] of STEPS) assert.ok(fs.existsSync(path.join(root, f)), f);
});

test('a missing generated file is reported with the one instruction, from a tree that has none', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-gen-'));
    try {
        assert.deepEqual(missingGenerated(empty), SENTINELS);
        assert.throws(() => requireGenerated(empty), e => e.message.startsWith(BOOTSTRAP_MESSAGE) && /node scripts\/bootstrap\.mjs/.test(e.message));
        assert.equal(generatedCurrent(empty), false);
    } finally { fs.rmSync(empty, { recursive: true, force: true }); }
});

test('bootstrap --if-missing does nothing when the generated files are current', { skip: missingGenerated().length > 0 && 'not bootstrapped' }, () => {
    if (!generatedCurrent()) return; // a source was edited since the bootstrap: not this test's business (generated-current.test.mjs says so)
    const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'bootstrap.mjs'), '--if-missing'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /nothing to do/);
});

test('bootstrap rejects an unknown flag', () => {
    const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'bootstrap.mjs'), '--bogus'], { encoding: 'utf8' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /unknown argument --bogus/);
});
