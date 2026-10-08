// The local bootstrap short-circuit (#713): it skips only when no input changed AND the generated files exist, and every miss runs the bootstrap.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { SENTINELS } from '../generated.mjs';
import { shortCircuit } from '../bootstrap.mjs';
import { sourceHash, writeStamp, clearStamp } from '../bootstrap-stamp.mjs';

const git = (cwd, ...args) => assert.equal(spawnSync('git', args, { cwd, encoding: 'utf8' }).status, 0, `git ${args.join(' ')}`);
function fixture() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-stamp-'));
    git(dir, 'init', '-q');
    fs.mkdirSync(path.join(dir, 'core'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'core', 'a.js'), 'one');
    fs.writeFileSync(path.join(dir, 'package-lock.json'), '{}');
    git(dir, 'add', '-A');
    for (const s of SENTINELS) { fs.mkdirSync(path.dirname(path.join(dir, s)), { recursive: true }); fs.writeFileSync(path.join(dir, s), 'generated'); }
    return dir;
}
const env = {}; // no CI, no PK_BOOTSTRAP_FORCE

test('a current stamp and every generated file present: skip', () => {
    const dir = fixture();
    writeStamp(dir, sourceHash(dir));
    assert.equal(shortCircuit(dir, { env }).skip, true);
});

test('miss: a source file edited, added (untracked) or deleted changes the hash and runs the bootstrap', () => {
    const dir = fixture(), stamped = sourceHash(dir);
    writeStamp(dir, stamped);
    fs.writeFileSync(path.join(dir, 'core', 'a.js'), 'two');
    assert.equal(shortCircuit(dir, { env }).skip, false, 'edited');
    fs.writeFileSync(path.join(dir, 'core', 'a.js'), 'one');
    assert.equal(shortCircuit(dir, { env }).skip, true, 'edited back: same bytes, same hash');
    fs.writeFileSync(path.join(dir, 'core', 'new.js'), 'x');
    assert.equal(shortCircuit(dir, { env }).skip, false, 'untracked file added');
    fs.rmSync(path.join(dir, 'core', 'new.js'));
    fs.rmSync(path.join(dir, 'core', 'a.js'));
    assert.equal(shortCircuit(dir, { env }).skip, false, 'tracked file deleted');
});

test('miss: a generated file deleted runs the bootstrap even when the sources are unchanged; editing a generated file does not change the hash', () => {
    const dir = fixture();
    writeStamp(dir, sourceHash(dir));
    fs.writeFileSync(path.join(dir, SENTINELS[0]), 'hand edited');
    assert.equal(shortCircuit(dir, { env }).skip, true, 'the hash ignores generated files (generated-current.test.mjs is the backstop for a hand edit)');
    fs.rmSync(path.join(dir, SENTINELS[0]));
    assert.equal(shortCircuit(dir, { env }).skip, false, 'a missing generated file');
});

test('miss: no stamp, force, PK_BOOTSTRAP_FORCE, CI, or not a git checkout', () => {
    const dir = fixture();
    assert.equal(shortCircuit(dir, { env }).skip, false, 'no stamp yet');
    writeStamp(dir, sourceHash(dir));
    assert.equal(shortCircuit(dir, { env, force: true }).skip, false, '--force');
    assert.equal(shortCircuit(dir, { env: { PK_BOOTSTRAP_FORCE: '1' } }).skip, false, 'PK_BOOTSTRAP_FORCE');
    assert.equal(shortCircuit(dir, { env: { CI: 'true' } }).skip, false, 'CI always does the full bootstrap');
    clearStamp(dir);
    assert.equal(shortCircuit(dir, { env }).skip, false, 'stamp cleared');
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-stamp-nogit-'));
    assert.equal(sourceHash(plain), null);
    assert.equal(shortCircuit(plain, { env }).skip, false, 'not a git checkout');
});
