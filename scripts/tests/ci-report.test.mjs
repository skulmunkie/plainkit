// scripts/ci-report.mjs: the sticky comment and the time-budget notes. Run: node --test scripts/tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, budgetNote, parseFailures, MARKER, JOBS, RUN_BUDGET } from '../ci-report.mjs';

const failure = { id: 'node-tests', name: 'node-tests', fix: 'run `node --test <file>`', excerpt: 'failing tests:\nAssertionError ```x```' };
const jobs = [{ name: JOBS.node.name, html_url: 'https://example.test/job/1' }, { name: JOBS.browser.name, html_url: 'https://example.test/job/2' }];

test('a failed job lists its checks, FIX lines, excerpt and log link under the marker', () => {
    const r = buildReport({ needs: { lint: { result: 'success', outputs: {} }, node: { result: 'failure', outputs: { failures: JSON.stringify([failure]) } } }, jobs, runSeconds: 41 });
    assert.equal(r.problems, 1);
    assert.ok(r.body.startsWith(MARKER));
    assert.ok(r.body.includes('#### Toolkit (node): [log](https://example.test/job/1)'));
    assert.ok(r.body.includes('FIX: run `node --test <file>`'));
    assert.ok(r.body.includes('failing tests') && !r.body.includes('```x```'), 'the excerpt cannot close the code fence');
    assert.ok(r.body.includes('node scripts/verify.mjs'));
    assert.ok(!r.body.includes('WARNING'), '41 s is inside the run budget');
    assert.ok(!r.summary.includes(MARKER));
});

test('a job that failed outside the checks says so and points at the log', () => {
    const r = buildReport({ needs: { dotnet: { result: 'failure', outputs: {} } }, jobs: [], runUrl: 'https://example.test/run' });
    assert.ok(r.body.includes('failed outside them') && r.body.includes('https://example.test/run') && r.body.includes('gh run view'));
});

test('a browser failure is marked not required; a flaky pass is reported', () => {
    const f = buildReport({ needs: { browser: { result: 'failure', outputs: { failures: JSON.stringify([{ ...failure, id: 'browser', name: 'browser' }]) } } }, jobs });
    assert.ok(f.body.includes('Browser (element suite) (not a required check)'));
    const k = buildReport({ needs: { browser: { result: 'success', outputs: { flaky: 'true' } } }, jobs });
    assert.equal(k.problems, 1);
    assert.ok(k.body.includes('flaky') && k.body.includes('rerun passed'));
});

test('everything green: a short "nothing to fix" (used to update an old comment)', () => {
    const r = buildReport({ needs: { lint: { result: 'success', outputs: {} }, node: { result: 'success', outputs: {} } }, jobs, runSeconds: 30 });
    assert.equal(r.problems, 0);
    assert.ok(r.body.startsWith(MARKER) && r.body.includes('CI is green'));
});

test('a cancelled job (a newer push) is flagged so no comment is written', () => {
    assert.equal(buildReport({ needs: { node: { result: 'cancelled', outputs: {} } }, jobs }).cancelled, true);
});

test('time budgets: a note, and a warning line only when over', () => {
    assert.equal(budgetNote('node job', 20, 30), 'node job: 20 s of a 30 s budget.');
    assert.match(budgetNote('node job', 41, 30), /\nWARNING: .*11 s over its time budget\. Do not raise the budget/);
    assert.deepEqual([JOBS.node.budget, RUN_BUDGET], [30, 60]);
    assert.match(buildReport({ needs: { node: { result: 'success', outputs: {} } }, jobs, runSeconds: 75 }).body, /WARNING: Whole run so far/);
});

test('the failures output is parsed defensively', () => {
    assert.deepEqual(parseFailures(''), []);
    assert.deepEqual(parseFailures('not json'), []);
    assert.deepEqual(parseFailures('{"a":1}'), []);
    assert.deepEqual(parseFailures('[{"id":"x"},null,7]'), [{ id: 'x', name: 'x', fix: '', excerpt: '' }]);
});
