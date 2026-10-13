// The module manifest (#364): readManifest's rules, the schema agreeing with them, and the shared fixture core/tests/fixtures/app-nav.json that the C# port (step 2 of the Blazor app framework) must also pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readManifest, appLocate, MANIFEST_KEYS } from '../tools/app-manifest.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/app-nav.json'), 'utf8'));
const schema = JSON.parse(fs.readFileSync(path.join(here, '../js/app/manifest.schema.json'), 'utf8'));
const manifests = fixture.modules.map(readManifest);

test('the schema and readManifest allow the same keys', () => {
    assert.deepEqual(Object.keys(schema.properties), MANIFEST_KEYS.module);
    assert.deepEqual(Object.keys(schema.$defs.navItem.properties), MANIFEST_KEYS.nav);
    assert.deepEqual(Object.keys(schema.$defs.route.properties), MANIFEST_KEYS.route);
    assert.deepEqual(Object.keys(schema.$defs.footer.properties), MANIFEST_KEYS.footer);
});

test('readManifest returns a valid manifest and rejects what is not data or not allowed', () => {
    assert.equal(readManifest({ id: 'a', title: 'A' }).id, 'a');
    assert.throws(() => readManifest(null), /must be an object/);
    assert.throws(() => readManifest({ id: 'a', title: 'A', can: () => true }), /unknown key "can"/);
    assert.throws(() => readManifest({ id: 'a', title: 'A', nav: () => [] }), /must be data/);
    assert.throws(() => readManifest({ id: 'a', title: 'A', nav: [{ id: 'x', title: 'X', color: 'red' }] }), /unknown key "color"/);
    assert.throws(() => readManifest({ id: 'a', title: 'A', routes: [{ path: '/' }] }), /needs page/);
    assert.throws(() => readManifest({ id: 'A', title: 'A' }), /MODULE_ID/);
    assert.throws(() => readManifest({ id: 'a', title: 'A', routes: [{ path: '/x', page: 'list' }, { path: '/x', page: 'list' }] }), /duplicate route/);
});

for (const c of fixture.cases) {
    test(`app nav fixture: ${c.name}`, () => assert.deepEqual(appLocate(manifests, fixture.brand, c.path), c.expect));
}
