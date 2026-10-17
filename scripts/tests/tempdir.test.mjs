// #1507: dev tooling and tests must not leave pk-* folders in the OS temp dir.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { removeTree } from '../../core/tools/tempdir.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const helper = path.join(root, 'core', 'tools', 'tempdir.mjs');
const cleanEnv = extra => ({ ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'NODE_TEST_CONTEXT')), ...extra });
function withScratch(fn) {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-tempdir-check-'));
    try { return fn(scratch); } finally { removeTree(scratch); }
}

test('a process that makes temp folders (read-only files included) and then throws leaves none behind', () => withScratch(scratch => {
    const code = `import { makeTempDir } from ${JSON.stringify(helper.replace(/\\/g, '/'))};
        import fs from 'node:fs'; import path from 'node:path';
        const a = makeTempDir('pk-x-'); fs.writeFileSync(path.join(a, 'ro.txt'), 'x'); fs.chmodSync(path.join(a, 'ro.txt'), 0o444);
        const b = makeTempDir('pk-y-'); fs.mkdirSync(path.join(b, 'deep'), { recursive: true }); fs.writeFileSync(path.join(b, 'deep', 'f'), 'y');
        throw new Error('boom');`;
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', env: cleanEnv({ PK_TMPDIR: scratch }) });
    assert.notEqual(r.status, 0, 'the child really failed');
    assert.deepEqual(fs.readdirSync(scratch), []);
}));

test('removeTree unlinks a junction instead of following it, and reports a missing folder as removed', () => withScratch(scratch => {
    const target = path.join(scratch, 'target'); fs.mkdirSync(target); fs.writeFileSync(path.join(target, 'keep'), 'k');
    const dir = path.join(scratch, 'copy'); fs.mkdirSync(dir);
    fs.symlinkSync(target, path.join(dir, 'node_modules'), 'junction');
    assert.equal(removeTree(dir), true);
    assert.equal(fs.existsSync(dir), false);
    assert.equal(fs.readFileSync(path.join(target, 'keep'), 'utf8'), 'k', 'the link target is untouched');
    assert.equal(removeTree(path.join(scratch, 'nope')), true);
}));

test('representative test files (stamp, ui-review cache, launch-browser, element folders) leave no temp folder when run', () => withScratch(scratch => {
    const files = ['scripts/tests/bootstrap-stamp.test.mjs', 'scripts/tests/ui-review-cache.test.mjs', 'scripts/tests/launch-browser.test.mjs', 'core/tests/element-folders.test.mjs'];
    const r = spawnSync(process.execPath, ['--test', ...files], { cwd: root, encoding: 'utf8', env: cleanEnv({ PK_TMPDIR: scratch }) });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.deepEqual(fs.readdirSync(scratch), []);
}));

test('no tool or test makes its own temp folder with mkdtempSync: they go through core/tools/tempdir.mjs', () => {
    const bad = [];
    const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.name === 'node_modules' ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
    for (const top of ['scripts', 'core/tools', 'core/tests']) for (const f of walk(path.join(root, top)))
        if (f.endsWith('.mjs') && !f.endsWith('tempdir.mjs') && !f.endsWith('tempdir.test.mjs') && /mkdtempSync\(/.test(fs.readFileSync(f, 'utf8'))) bad.push(path.relative(root, f));
    assert.deepEqual(bad, [], 'FIX: use makeTempDir(prefix) from core/tools/tempdir.mjs (removed at exit even on failure)');
});
