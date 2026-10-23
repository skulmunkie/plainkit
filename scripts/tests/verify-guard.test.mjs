// scripts/verify-guard.mjs (#1754): the watchdog message, the per-checkout lock with stale detection, the run stamps and the watchdog in runCmd.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeTempDir } from '../../core/tools/tempdir.mjs';
import { runningFiles, stallMessage, acquireLock, checkStamps, writeRunStamp, killTree } from '../verify-guard.mjs';
import { runCmd, nodeTestWorkers, CHECKS } from '../verify.mjs';

test('runningFiles names the files with a started test that has not ended', () => {
    const p = 'start\ta.test.mjs\tx\nstart\tb.test.mjs\ty\nend\ta.test.mjs\tx\nstart\tc.test.mjs\tz\n';
    assert.deepEqual(runningFiles(p), ['b.test.mjs', 'c.test.mjs']);
    assert.deepEqual(runningFiles(''), []);
    assert.match(stallMessage({ reason: 'no output', seconds: 5, files: ['b.test.mjs'] }), /WATCHDOG.*b\.test\.mjs/);
});

test('lock: a live holder refuses, a dead holder is replaced, release frees it, waiting gets the lock when the holder ends', async () => {
    const dir = makeTempDir('pk-lock-test-'); const file = path.join(dir, 'l.lock');
    try {
        const a = await acquireLock(dir, { file, pid: 1001, alive: () => true });
        assert.equal(a.ok, true);
        const b = await acquireLock(dir, { file, pid: 1002, alive: p => p === 1001 });
        assert.equal(b.ok, false); assert.match(b.message, /pid 1001/);
        let alive = true; let polls = 0;
        const w = await acquireLock(dir, { file, pid: 1003, alive: () => alive, waitMs: 10000, pollMs: 1, sleep: async () => { if (++polls === 3) alive = false; } });
        assert.equal(w.ok, true, 'a stale holder (process gone) is replaced while waiting'); assert.ok(polls >= 3);
        assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).pid, 1003);
        a.release(); assert.ok(fs.existsSync(file), 'a release by a non-owner leaves the lock');
        w.release(); assert.ok(!fs.existsSync(file));
        fs.writeFileSync(file, 'not json');
        assert.equal((await acquireLock(dir, { file, pid: 1004 })).ok, true, 'an unreadable lock is stale');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('stamps: matching tree passes; missing, stale and failed runs do not; writeRunStamp round-trips', () => {
    const dir = makeTempDir('pk-stamp-test-');
    try {
        writeRunStamp('.', 'browser', true, { dir, id: 'T1' });
        writeRunStamp('.', 'ui-review', true, { dir, id: 'T0' });
        writeRunStamp('.', 'blazor-browser', false, { dir, id: 'T1' });
        const r = checkStamps(['browser', 'ui-review', 'blazor-browser'], 'T1', { dir });
        assert.equal(r.ok, false);
        assert.match(r.lines[0], /^ok .*browser/); assert.match(r.lines[1], /^STALE .*ui-review/); assert.match(r.lines[2], /^FAILED .*blazor-browser/);
        assert.equal(checkStamps(['browser'], 'T1', { dir }).ok, true);
        assert.match(checkStamps(['nothing'], 'T1', { dir }).lines[0], /^MISSING/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('runCmd: an idle command is ended by the watchdog (code 124, message); a chatty one hits the total cap; a short one is untouched', async () => {
    const hang = await runCmd([process.execPath, '-e', 'setInterval(() => {}, 1000)'], process.cwd(), process.env, { idleMs: 1500 });
    assert.equal(hang.code, 124); assert.match(hang.out, /WATCHDOG/);
    const ok = await runCmd([process.execPath, '-e', 'console.log("hi")'], process.cwd(), process.env, { idleMs: 20000 });
    assert.equal(ok.code, 0); assert.match(ok.out, /hi/);
    const total = await runCmd([process.execPath, '-e', 'setInterval(() => console.log("x"), 100)'], process.cwd(), process.env, { totalMs: 1500 });
    assert.equal(total.code, 124); assert.match(total.out, /total time/);
});

test('killTree ends a process', async () => {
    const c = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
    const closed = new Promise(r => c.on('close', r));
    killTree(c.pid);
    await closed;
});

test('node-tests: per-test timeout, bounded workers by free memory, and a watchdog with a FIX line', () => {
    assert.equal(nodeTestWorkers({ cpus: 16, freeBytes: 2 * 2 ** 30 }), 3, '2 GB free allows 3 workers of 650 MB');
    assert.equal(nodeTestWorkers({ cpus: 16, freeBytes: 0.1 * 2 ** 30 }), 1, 'never below one');
    assert.equal(nodeTestWorkers({ cpus: 4, freeBytes: 64 * 2 ** 30 }), 3, 'never above cpus - 1');
    assert.equal(nodeTestWorkers({ cpus: 1, freeBytes: 64 * 2 ** 30 }), 1);
    const c = CHECKS.find(x => x.id === 'node-tests');
    const args = c.cmd().join(' ');
    assert.match(args, /--test-timeout=\d+/); assert.match(args, /--test-concurrency=\d+/); assert.match(args, /test-progress-reporter/);
    assert.ok(c.watch?.idleMs > 0 && c.watch?.totalMs > c.watch.idleMs);
    assert.match(c.fix, /stall|hang|watchdog/i);
});

test('a stalled test file is named by the watchdog (through the real node --test and the progress reporter)', async () => {
    const dir = makeTempDir('pk-stall-test-');
    try {
        const file = path.join(dir, 'stall.test.mjs'); const prog = path.join(dir, 'progress.log');
        fs.writeFileSync(file, "import test from 'node:test';\ntest('never ends', () => new Promise(() => { setInterval(() => {}, 1000); }));\n");
        const reporter = pathToFileURL(fileURLToPath(new URL('../test-progress-reporter.mjs', import.meta.url))).href;
        const r = await runCmd([process.execPath, '--test', '--test-reporter=spec', '--test-reporter-destination=stdout', `--test-reporter=${reporter}`, `--test-reporter-destination=${prog}`, file], process.cwd(), { ...process.env, NODE_TEST_CONTEXT: undefined }, { idleMs: 6000, progressFile: prog });
        assert.equal(r.code, 124); assert.match(r.out, /WATCHDOG/); assert.ok(r.out.includes('stall.test.mjs'), r.out);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
