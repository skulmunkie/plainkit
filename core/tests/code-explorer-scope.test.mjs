import test from 'node:test';
import assert from 'node:assert/strict';
import { inScope, filterGroups, extensionsOf, isTestPath } from '../modules/code-explorer/scope.js';

test('an empty scope keeps every path', () => { assert.equal(inScope('a/b.cs', {}), true); assert.equal(inScope('a/b.cs'), true); });

test('folder is a path prefix on a segment boundary', () => {
    assert.equal(inScope('src/api/x.cs', { folder: 'src/api' }), true);
    assert.equal(inScope('src/api/x.cs', { folder: '/src/api/' }), true);
    assert.equal(inScope('src/apiary/x.cs', { folder: 'src/api' }), false);
    assert.equal(inScope('src/x.cs', { folder: 'docs' }), false);
});

test('ext ignores a leading dot and case', () => {
    assert.equal(inScope('a/X.CS', { ext: '.cs' }), true);
    assert.equal(inScope('a/x.js', { ext: 'cs' }), false);
});

test('test files are recognised by folder and by name', () => {
    for (const p of ['core/tests/a.js', 'src/__tests__/a.js', 'a/foo.test.mjs', 'a/foo.spec.ts', 'a/FooTests.cs', 'x/Test/a.cs']) assert.equal(isTestPath(p), true, p);
    for (const p of ['src/latest.js', 'src/contest/a.js', 'a/Attestation.cs']) assert.equal(isTestPath(p), false, p);
    assert.equal(inScope('a/FooTests.cs', { skipTests: true }), false);
});

test('filterGroups combines the three and extensionsOf lists the file types', () => {
    const groups = [{ path: 'src/a.cs', hits: [1] }, { path: 'src/a.test.cs', hits: [1] }, { path: 'docs/a.md', hits: [1] }];
    assert.deepEqual(filterGroups(groups, { folder: 'src', ext: 'cs', skipTests: true }).map(g => g.path), ['src/a.cs']);
    assert.deepEqual(extensionsOf(groups), ['cs', 'md']);
});
