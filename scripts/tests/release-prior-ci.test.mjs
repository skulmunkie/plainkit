// scripts/release-prior-ci.mjs: when a version tag may skip the full verify because the release pull request already passed the full CI on the same tree.
import test from 'node:test';
import assert from 'node:assert/strict';
import { decide, releasePull, REQUIRED } from '../release-prior-ci.mjs';

const pr = { number: 1768, merged_at: '2026-10-23T20:17:10Z', head: { ref: 'release/0.23.0', sha: 'h' } };
const green = REQUIRED.map(name => ({ name, status: 'completed', conclusion: 'success', completed_at: '2026-10-23T20:00:00Z' }));

test('the merged release pull request with every full check green on the same tree: skip', () => {
    const r = decide({ pulls: [pr], tagTree: 't1', headTree: 't1', checkRuns: [...green, { name: 'CI summary', conclusion: 'success' }] });
    assert.equal(r.skip, true, r.reason);
});

test('any doubt runs the full verify: no release pull request, another tree, a check missing, failed, skipped or still running', () => {
    assert.equal(decide({ pulls: [], tagTree: 't1', headTree: 't1', checkRuns: green }).skip, false);
    assert.equal(decide({ pulls: [{ ...pr, head: { ref: 'agent/1-x', sha: 'h' } }], tagTree: 't1', headTree: 't1', checkRuns: green }).skip, false, 'not a release branch');
    assert.equal(decide({ pulls: [{ ...pr, merged_at: null }], tagTree: 't1', headTree: 't1', checkRuns: green }).skip, false, 'not merged');
    assert.match(decide({ pulls: [pr], tagTree: 't1', headTree: 't2', checkRuns: green }).reason, /not the tree/);
    assert.equal(decide({ pulls: [pr], tagTree: null, headTree: null, checkRuns: green }).skip, false);
    for (const name of REQUIRED) {
        assert.match(decide({ pulls: [pr], tagTree: 't1', headTree: 't1', checkRuns: green.filter(c => c.name !== name) }).reason, /missing/, `${name} missing`);
        for (const conclusion of ['failure', 'skipped', 'cancelled', null]) {
            const runs = green.map(c => (c.name === name ? { ...c, conclusion, status: conclusion ? 'completed' : 'in_progress' } : c));
            assert.equal(decide({ pulls: [pr], tagTree: 't1', headTree: 't1', checkRuns: runs }).skip, false, `${name} ${conclusion}`);
        }
    }
});

test('a re-run counts: the latest run of a check decides', () => {
    const rerunGreen = [...green.map(c => (c.name === 'Toolkit (node)' ? { ...c, conclusion: 'failure', completed_at: '2026-10-23T19:00:00Z' } : c)), { name: 'Toolkit (node)', conclusion: 'success', completed_at: '2026-10-23T20:05:00Z' }];
    assert.equal(decide({ pulls: [pr], tagTree: 't1', headTree: 't1', checkRuns: rerunGreen }).skip, true);
    const rerunRed = [...green, { name: 'Toolkit (node)', conclusion: 'failure', completed_at: '2026-10-23T21:00:00Z' }];
    assert.equal(decide({ pulls: [pr], tagTree: 't1', headTree: 't1', checkRuns: rerunRed }).skip, false);
});

test('releasePull picks the merged release/* pull request among the commit\'s pull requests', () => {
    assert.equal(releasePull([{ number: 1, merged_at: null, head: { ref: 'release/1.0.0' } }, pr]).number, 1768);
    assert.equal(releasePull(undefined), null);
});
