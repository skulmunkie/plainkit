import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, validateImage, targetPath, rawUrl, markdown, safeName, UsageError, MAX_BYTES } from '../issue-image.mjs';

test('parseArgs reads issue, file, name and comment', () => {
    assert.deepEqual(parseArgs(['52', 'a.png', '--name', 'found', '--comment']), { issue: 52, file: 'a.png', name: 'found', comment: true });
    assert.deepEqual(parseArgs(['7', 'a.png']), { issue: 7, file: 'a.png', name: null, comment: false });
});

test('parseArgs rejects bad input with a FIX', () => {
    for (const argv of [[], ['x', 'a.png'], ['1'], ['1', 'a.png', '--nope'], ['1', 'a.png', '--name']]) {
        assert.throws(() => parseArgs(argv), e => e instanceof UsageError && Boolean(e.fix));
    }
});

test('validateImage checks type and size', () => {
    assert.equal(validateImage('A.PNG', 10), '.png');
    assert.throws(() => validateImage('a.svg', 10), UsageError);
    assert.throws(() => validateImage('a.png', MAX_BYTES + 1), /2 MB/);
    assert.throws(() => validateImage('a.png', 0), UsageError);
    assert.equal(validateImage('a.webp', MAX_BYTES), '.webp');
});

test('targetPath names the file under the issue folder', () => {
    assert.equal(targetPath(52, 'C:/x/Shot One.PNG', 'found'), 'issue-52/found.png');
    assert.equal(targetPath(52, 'x/Shot One.png'), 'issue-52/shot-one.png');
    assert.equal(targetPath(5, 'a.jpeg', 'Expected!'), 'issue-5/expected.jpg');
    assert.throws(() => targetPath(1, 'a.png', '!!!'), UsageError);
    assert.equal(safeName('../../evil'), 'evil');
});

test('url and markdown', () => {
    assert.equal(rawUrl('issue-1/found.png'), 'https://raw.githubusercontent.com/skulmunkie/plainkit/issue-images/issue-1/found.png');
    assert.equal(markdown('issue-1/found.png'), '![found](https://raw.githubusercontent.com/skulmunkie/plainkit/issue-images/issue-1/found.png)');
});
