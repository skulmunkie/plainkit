// Carve-out, split for parallelism (issue #1107): the copy passes its own tests (the slow case: the whole suite, serially, inside the copy).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { skip, makeCopy, removeCopy } from './carveout-helpers.mjs';

let copy;
test('copy the Plainkit folder outside the repository', { skip }, () => { copy = makeCopy(); });

test('the copy passes its own tests, security scanner and static audit', { skip }, () => {
    const env = { ...process.env, CARVEOUT_CHILD: '1' };
    const t = spawnSync(process.execPath, ['--test'], { cwd: copy, encoding: 'utf8', env });
    assert.equal(t.status, 0, (t.stdout + t.stderr).split('\n').filter(l => /✖|fail|Error/.test(l)).slice(0, 12).join('\n'));
    assert.equal(spawnSync(process.execPath, ['tools/security.mjs'], { cwd: copy, encoding: 'utf8' }).status, 0);
    assert.equal(spawnSync(process.execPath, ['site/scorecard/static-audit.mjs'], { cwd: copy, encoding: 'utf8' }).status, 0);
});

test('clean up the copy', { skip }, () => removeCopy(copy));
