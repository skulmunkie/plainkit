// The pure parts of scripts/bootstrap.mjs: ensureMergeDriver (issue #417), and that .gitattributes actually names the driver it registers.
// STEPS/bootstrap itself spawns the six generator scripts for real and is exercised by every other test file that calls it (or verify.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureMergeDriver } from '../bootstrap.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('ensureMergeDriver sets merge.keep-current.driver=true once, and does not re-set it when already true', () => {
    const calls = [];
    const notSet = ({ status: 1, stdout: '' });
    const run = (cmd, args) => { calls.push(args.join(' ')); return args.includes('--get') ? notSet : { status: 0 }; };
    assert.equal(ensureMergeDriver({ cwd: '/repo', run }), true);
    assert.deepEqual(calls, ['config --get merge.keep-current.driver', 'config merge.keep-current.driver true']);

    calls.length = 0;
    const alreadySet = (cmd, args) => { calls.push(args.join(' ')); return args.includes('--get') ? { status: 0, stdout: 'true\n' } : { status: 0 }; };
    assert.equal(ensureMergeDriver({ cwd: '/repo', run: alreadySet }), true);
    assert.deepEqual(calls, ['config --get merge.keep-current.driver'], 'already registered: no write needed');
});

test('ensureMergeDriver never throws: a git failure or a missing binary is best-effort, not fatal', () => {
    assert.equal(ensureMergeDriver({ cwd: '/repo', run: () => { throw new Error('no git'); } }), false);
    assert.equal(ensureMergeDriver({ cwd: '/repo', run: () => ({ status: 1, stdout: '' }) }), false);
});

test('.gitattributes declares merge=keep-current for the exact path the driver is registered for', () => {
    const text = fs.readFileSync(path.join(root, '.gitattributes'), 'utf8');
    assert.match(text, /^core\/tests\/browser\/report\.json .*\bmerge=keep-current\b/m);
});
