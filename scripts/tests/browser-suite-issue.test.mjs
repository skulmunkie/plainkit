import test from 'node:test';
import assert from 'node:assert/strict';
import { failedCases, failureComment, greenComment, alreadyGreen, GREEN_MARKER, TITLE } from '../browser-suite-issue.mjs';

test('failedCases lists the failed names, and is null for anything but a report', () => {
    const report = { passed: 1, failed: 2, results: [{ name: 'a', ok: true }, { name: 'b', ok: false, error: 'boom' }, { name: 'c', ok: false }] };
    assert.deepEqual(failedCases(report), [{ name: 'b', error: 'boom' }, { name: 'c', error: '' }]);
    assert.deepEqual(failedCases({ results: [] }), []);
    assert.equal(failedCases(null), null);
    assert.equal(failedCases({}), null);
});

test('the failure comment carries the run URL, the case names and the counts', () => {
    const body = failureComment({ runUrl: 'https://example.test/run/1', sha: '0123456789abcdef', failed: [{ name: 'tabs: arrows', error: 'a\n  b' }], passed: 9, total: 10 });
    assert.match(body, /https:\/\/example\.test\/run\/1/);
    assert.match(body, /01234567/);
    assert.match(body, /9 of 10 cases passed; 1 failed/);
    assert.match(body, /- tabs: arrows: a b/);
});

test('a run with no report says the suite could not finish', () => {
    assert.match(failureComment({ runUrl: 'u', sha: '', failed: null }), /could not finish/);
});

test('green comments are posted once per recovery', () => {
    assert.equal(alreadyGreen([]), false);
    assert.equal(alreadyGreen([{ body: 'failing' }]), false);
    assert.equal(alreadyGreen([{ body: 'failing' }, { body: greenComment({ runUrl: 'u', sha: 'abc' }) }]), true);
    assert.ok(greenComment({ runUrl: 'u', sha: 'abc' }).includes(GREEN_MARKER));
    assert.equal(TITLE, 'In-browser suite failing on main');
});
