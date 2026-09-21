// Versioning (issue #23): SemVer rules, the bump an API diff needs, and every place the version appears agreeing with core/VERSION.
import './needs-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseVersion, compareVersions, changeLevel, requiredBump, minimumLevel, coversBump, isPrerelease, tagMatches, readVersion, versionMismatches } from '../tools/versioning.mjs';
import { elementSurface, surface, removed } from '../tools/api-surface.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');

test('versions parse as SemVer 2.0 and reject everything else', () => {
    assert.deepEqual(parseVersion('1.2.3'), { major: 1, minor: 2, patch: 3, pre: [] });
    assert.deepEqual(parseVersion('0.1.0-alpha.1'), { major: 0, minor: 1, patch: 0, pre: ['alpha', '1'] });
    assert.deepEqual(parseVersion('1.0.0-rc.1+build.5').pre, ['rc', '1']);
    for (const bad of ['1.2', 'v1.2.3', '01.2.3', '1.2.3-', '1.2.3-01', 'latest', '', null]) assert.equal(parseVersion(bad), null, String(bad));
    assert.equal(isPrerelease('0.1.0-alpha.1'), true);
    assert.equal(isPrerelease('0.1.0'), false);
});

test('precedence follows SemVer: pre-releases sort before their release, numbers compare as numbers', () => {
    const order = ['0.1.0-alpha.1', '0.1.0-alpha.2', '0.1.0-alpha.10', '0.1.0-beta.1', '0.1.0-rc.1', '0.1.0', '0.1.1', '0.2.0', '1.0.0'];
    for (let i = 1; i < order.length; i++) assert.equal(compareVersions(order[i - 1], order[i]), -1, `${order[i - 1]} < ${order[i]}`);
    assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
    assert.equal(compareVersions('1.0.0-alpha', '1.0.0-alpha.1'), -1, 'a shorter list sorts first');
    assert.equal(compareVersions('1.0.0-1', '1.0.0-alpha'), -1, 'numeric identifiers sort before text');
    assert.throws(() => compareVersions('nope', '1.0.0'), /not a version/);
});

test('the level of a change between two versions', () => {
    assert.equal(changeLevel('0.1.0', '1.0.0'), 'major');
    assert.equal(changeLevel('0.1.0', '0.2.0'), 'minor');
    assert.equal(changeLevel('0.1.0', '0.1.1'), 'patch');
    assert.equal(changeLevel('0.1.0-alpha.1', '0.1.0-alpha.2'), 'prerelease');
    assert.equal(changeLevel('0.1.0-alpha.2', '0.1.0'), 'prerelease');
    assert.equal(changeLevel('0.1.0', '0.1.0'), 'none');
    assert.equal(changeLevel('0.2.0', '0.1.0'), 'downgrade');
});

test('an API diff needs a breaking, feature or fix bump: removals and changed items are breaking, new items are features', () => {
    const before = { classes: ['a', 'b'], tokens: ['--t'], exports: ['js/x.js:f'], elements: ['pk-x', 'pk-x:prop:kind', 'pk-x:prop:kind:default="info"'] };
    assert.equal(requiredBump(before, before).required, 'fix');
    const grew = { ...before, elements: [...before.elements, 'pk-x:prop:size'] };
    assert.deepEqual(requiredBump(before, grew), { required: 'feature', removed: [], added: ['elements: pk-x:prop:size'] });
    const changedDefault = { ...before, elements: ['pk-x', 'pk-x:prop:kind', 'pk-x:prop:kind:default="danger"'] };
    const r = requiredBump(before, changedDefault);
    assert.equal(r.required, 'breaking', 'a changed default is one item removed and one added');
    assert.deepEqual(r.removed, ['elements: pk-x:prop:kind:default="info"']);
    assert.equal(requiredBump(before, { ...before, classes: ['a'] }).required, 'breaking');
    assert.equal(requiredBump({ classes: [] }, { classes: [] }).required, 'fix', 'a baseline without a key is fine');
});

test('the smallest bump that covers each kind of change, and 0.x treats a breaking change as a minor bump', () => {
    assert.equal(minimumLevel('breaking', '0.3.0'), 'minor');
    assert.equal(minimumLevel('breaking', '1.4.2'), 'major');
    assert.equal(minimumLevel('feature', '1.4.2'), 'minor');
    assert.equal(minimumLevel('fix', '1.4.2'), 'prerelease');
    assert.equal(coversBump('0.1.0', '0.2.0', 'breaking').ok, true);
    assert.equal(coversBump('0.1.0', '0.1.1', 'breaking').ok, false);
    assert.match(coversBump('0.1.0', '0.1.1', 'breaking').reason, /breaking changes since 0\.1\.0 need at least a minor bump/);
    assert.equal(coversBump('1.0.0', '1.1.0', 'breaking').ok, false, 'after 1.0 a breaking change needs a major bump');
    assert.equal(coversBump('1.0.0', '2.0.0', 'breaking').ok, true);
    assert.equal(coversBump('1.0.0', '1.1.0', 'feature').ok, true);
    assert.equal(coversBump('1.0.0', '1.0.1', 'feature').ok, false);
    assert.equal(coversBump('1.0.0', '1.0.1', 'fix').ok, true);
    assert.equal(coversBump('1.0.0', '1.0.0', 'fix').ok, false, 'the same version is not a release');
    assert.equal(coversBump('1.0.0', '0.9.0', 'fix').ok, false);
});

test('a release tag names exactly the version', () => {
    assert.equal(tagMatches('v0.1.0-alpha.1', '0.1.0-alpha.1'), true);
    assert.equal(tagMatches('v0.1.0', '0.1.0-alpha.1'), false);
    assert.equal(tagMatches('0.1.0', '0.1.0'), false, 'the tag has the v');
});

test('core/VERSION is a SemVer version and every place it is stamped agrees with it', () => {
    const version = readVersion();
    assert.ok(parseVersion(version), `core/VERSION is "${version}"`);
    assert.deepEqual(versionMismatches(), []);
    assert.match(read('js/version.js'), new RegExp(`PK_VERSION = '${version.replace(/[.+-]/g, '\\$&')}'`));
    assert.equal(JSON.parse(read('dist/manifest.json')).version, version);
    assert.match(fs.readFileSync(path.join(root, '..', 'Directory.Build.props'), 'utf8'), /ReadAllText\(.*core\/VERSION/, 'MSBuild reads the version from core/VERSION, not a second literal');
});

test('the element API is listed as flat items: tag, props with type, default and values, slots, events, parts, css properties, methods', () => {
    const items = elementSurface();
    for (const expected of ['pk-alert', 'pk-alert:prop:kind', 'pk-alert:prop:kind:type=enum', 'pk-alert:prop:kind:value=danger', 'pk-alert:event:pk-dismiss', 'pk-alert:slot:(default)', 'pk-alert:method:dismiss()']) {
        assert.ok(items.includes(expected), expected);
    }
    assert.ok(items.some(i => /^pk-alert:prop:kind:default=/.test(i)));
    assert.deepEqual(items, [...items].sort(), 'sorted, so a diff is stable');
    assert.equal(new Set(items).size, items.length);
    assert.ok(!items.some(i => /blazor/i.test(i)), 'the Blazor mapping is not part of the SDK API');
    assert.deepEqual(Object.keys(surface()), ['classes', 'tokens', 'exports', 'elements']);
});

test('the API baseline is well formed: a release (or none yet) that is not newer than core/VERSION, and lists for every kind of item', () => {
    const baseline = JSON.parse(read('site/scorecard/api.baseline.json'));
    assert.ok(baseline.release === null || parseVersion(baseline.release), 'release is null or a version');
    if (baseline.release) assert.ok(compareVersions(baseline.release, readVersion()) <= 0, 'core/VERSION is not older than the baseline release');
    for (const k of ['classes', 'tokens', 'exports', 'elements']) assert.ok(Array.isArray(baseline[k]) && baseline[k].length > 0, k);
    // Between releases the API may change; the release pull request compares it with the baseline (node core/tools/versioning.mjs bump --require).
    assert.ok(Array.isArray(removed(baseline, surface())));
});
