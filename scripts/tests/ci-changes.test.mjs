// scripts/ci-changes.mjs: which CI jobs a pull request needs. Run: node --test scripts/tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { decide, isDocsOnly } from '../ci-changes.mjs';

const runs = files => ['node', 'dotnet', 'browser', 'pack'].filter(a => decide(a, { event: 'pull_request', files }).run);

test('a docs-only or workflow-only pull request skips node, dotnet, browser and pack', () => {
    assert.deepEqual(runs(['CONTRIBUTING.md', 'changelog/unreleased/1-x.md']), []);
    assert.deepEqual(runs(['.github/workflows/pages.yml', '.github/PULL_REQUEST_TEMPLATE/release.md']), []);
});

test('files that tests or generators read are not "just docs" for node', () => {
    for (const f of ['AGENTS.md', 'README.md', 'PUBLISHING.md', 'core/README.md', 'core/STANDARDS.md', 'scripts/skills/plainkit-sdk/SKILL.md', '.github/workflows/ci.yml', '.github/REPO-SETTINGS.md']) {
        assert.equal(decide('node', { event: 'pull_request', files: [f] }).run, true, f);
    }
    assert.equal(decide('dotnet', { event: 'pull_request', files: ['.github/workflows/ci.yml'] }).run, false, 'a workflow file never needs the .NET build');
});

test('what a change needs', () => {
    assert.deepEqual(runs(['core/elements/pk-tabs/pk-tabs.js']), ['node', 'dotnet', 'browser', 'pack']);
    assert.deepEqual(runs(['core/tests/browser/cases.js']), ['node', 'browser']);
    assert.deepEqual(runs(['scripts/tests/verify.test.mjs']), ['node']);
    assert.deepEqual(runs(['blazor/src/PlainKit.Blazor/Components/PkX.razor']), ['node', 'dotnet', 'pack']);
    assert.deepEqual(runs(['core/site/gallery/index.html']), ['node', 'dotnet']);
    assert.deepEqual(runs(['scripts/attest-browser.mjs']), ['node', 'dotnet', 'browser']);
    assert.deepEqual(runs(['core/VERSION', 'CHANGELOG.md']), ['node', 'dotnet', 'pack']);
    assert.deepEqual(runs(['Directory.Packages.props']), ['node', 'dotnet', 'pack']);
});

test('one code file among docs is enough; nothing known means run', () => {
    assert.equal(decide('node', { event: 'pull_request', files: ['CONTRIBUTING.md', 'core/js/x.js'] }).run, true);
    assert.equal(decide('node', { event: 'pull_request', files: null }).run, true);
    assert.equal(decide('dotnet', { event: 'pull_request', files: [] }).run, true);
});

test('push and manual runs', () => {
    for (const a of ['node', 'dotnet', 'pack']) assert.equal(decide(a, { event: 'push', files: null }).run, true);
    assert.equal(decide('browser', { event: 'push', files: null }).run, false);
    for (const a of ['node', 'dotnet', 'pack', 'browser']) assert.equal(decide(a, { event: 'workflow_dispatch', files: null }).run, true);
    assert.throws(() => decide('nope', { event: 'push' }), /unknown area/);
    assert.equal(isDocsOnly('docs/x.md'), false, 'markdown in a folder is not root documentation');
});
