// launchBrowser (scripts/attest-browser.mjs): the launch step retries, nothing else does (#1457). A fake spawn stands in for the browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { launchBrowser } from '../attest-browser.mjs';

function setup(failures) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-launch-test-'));
    const spawned = [], killed = [], profilesAtSpawn = [];
    const spawnFn = () => {
        const child = new EventEmitter();
        child.stderr = new EventEmitter();
        spawned.push(child);
        profilesAtSpawn.push(fs.readdirSync(profile).length);
        fs.writeFileSync(path.join(profile, 'stale'), 'x'); // a leftover that must be gone for the next attempt
        setImmediate(() => child.stderr.emit('data', `line one\nstderr of attempt ${spawned.length}\n`));
        child.ready = spawned.length > failures;
        return child;
    };
    const probe = () => (spawned.at(-1)?.ready ? Promise.resolve('9222') : Promise.resolve(null));
    const kill = c => killed.push(c);
    const remove = async d => { fs.rmSync(d, { recursive: true, force: true }); return true; };
    return { profile, spawned, killed, profilesAtSpawn, opts: { chrome: 'C:\\chrome.exe', profile, args: [], probe, spawnFn, kill, remove, waitMs: 40, pollMs: 5 } };
}

test('fails twice, then succeeds: the earlier children are killed and each attempt gets an empty profile', async () => {
    const t = setup(2);
    const r = await launchBrowser(t.opts);
    assert.equal(r.attempts, 3);
    assert.equal(r.value, '9222');
    assert.equal(r.browser, t.spawned[2]);
    assert.deepEqual(t.killed, [t.spawned[0], t.spawned[1]]);
    assert.deepEqual(t.profilesAtSpawn, [0, 0, 0]);
    fs.rmSync(t.profile, { recursive: true, force: true });
});

test('succeeds first time: one spawn, no kill', async () => {
    const t = setup(0);
    const r = await launchBrowser(t.opts);
    assert.equal(r.attempts, 1);
    assert.equal(t.spawned.length, 1);
    assert.equal(t.killed.length, 0);
    fs.rmSync(t.profile, { recursive: true, force: true });
});

test('fails three times: the message names the attempts, the path and the last stderr line', async () => {
    const t = setup(99);
    await assert.rejects(launchBrowser(t.opts), e => {
        assert.match(e.message, /in 3 attempts/);
        assert.match(e.message, /C:\\chrome\.exe/);
        assert.match(e.message, /last stderr: stderr of attempt 3/);
        return true;
    });
    assert.equal(t.spawned.length, 3);
    assert.equal(t.killed.length, 3);
    fs.rmSync(t.profile, { recursive: true, force: true });
});

test('a probe that throws (a port file still being written, EBUSY on Windows) is not ready yet, and succeeds on the next poll', async () => {
    const t = setup(0);
    let calls = 0;
    t.opts.probe = () => { if (++calls < 3) throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' }); return '9222'; };
    const r = await launchBrowser(t.opts);
    assert.equal(r.value, '9222');
    assert.equal(r.attempts, 1);
    assert.equal(t.killed.length, 0);
    fs.rmSync(t.profile, { recursive: true, force: true });
});

test('a probe that always throws is reported with its message in the final error', async () => {
    const t = setup(0);
    t.opts.probe = () => { throw new Error('EBUSY: resource busy or locked'); };
    await assert.rejects(launchBrowser(t.opts), e => /last stderr: .*EBUSY/.test(e.message));
    fs.rmSync(t.profile, { recursive: true, force: true });
});
