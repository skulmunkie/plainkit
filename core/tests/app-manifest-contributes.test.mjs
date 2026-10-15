// #1296: a module manifest carries `contributes` (dashboard widgets) as data. readManifest checks it with the SDK's own readContribution, the schema agrees,
// and core/tests/fixtures/dashboard-compose.json (compose through readManifest) is the file the C# PkDashboardSurface test also reads.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readManifest, MANIFEST_KEYS } from '../tools/app-manifest.mjs';
import { compose } from '../js/app/pages/dashboard-compose.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/dashboard-compose.json'), 'utf8'));
const schema = JSON.parse(fs.readFileSync(path.join(here, '../js/app/manifest.schema.json'), 'utf8'));
const ok = { key: 'a', for: ['x'], label: 'A', kind: 'stat' };

test('the schema and readManifest allow the same contribution keys', () => {
    assert.deepEqual(Object.keys(schema.$defs.contribution.properties), MANIFEST_KEYS.contribution);
    assert.ok('contributes' in schema.properties);
});

test('readManifest accepts contributes and rejects what the SDK refuses', () => {
    assert.equal(readManifest({ id: 'a', title: 'A', contributes: [ok] }).id, 'a');
    assert.throws(() => readManifest({ id: 'a', title: 'A', contributes: [{ ...ok, can: () => true }] }), /must be data|unknown key "can"/);
    assert.throws(() => readManifest({ id: 'a', title: 'A', contributes: [{ ...ok, color: 'red' }] }), /unknown key "color"/);
    assert.throws(() => readManifest({ id: 'a', title: 'A', contributes: [{ ...ok, kind: 'map' }] }), /kind/);
    assert.throws(() => readManifest({ id: 'a', title: 'A', contributes: [ok, ok] }), /used twice/);
    assert.throws(() => readManifest({ id: 'a', title: 'A', contributes: {} }), /must be an array/);
});

for (const c of fixture.cases) {
    test(`dashboard compose fixture: ${c.name}`, () => {
        const entries = fixture.modules.map(readManifest).map((m, i) => ({ id: m.id, contributes: fixture.modules[i].contributes }));
        const got = compose(entries, { surface: c.surface, tabs: c.tabs });
        assert.deepEqual(got.tabs.map(t => ({ ...t })), c.expect.tabs);
        assert.deepEqual(got.widgets.map(w => ({ key: w.id, label: w.label, kind: w.kind, tab: w.tab, size: w.size })), c.expect.widgets);
    });
}
