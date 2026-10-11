// The shared fixture core/tests/fixtures/page-context.json (#670): js/page-context.js and the C# port (blazor PkPageContext.cs, PkPageContextTests.cs) must return the same context for the same inputs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageContext } from '../js/page-context.js';
import { navRoutes } from '../js/route-tree.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/page-context.json'), 'utf8'));
const revive = rs => rs.map(r => ({ ...r, ...(r.labelParam ? { label: p => p[r.labelParam] } : {}), children: revive(r.children ?? []) }));

for (const c of fixture.cases) {
    test(`page context fixture: ${c.name}`, () => {
        assert.deepEqual(pageContext({ routes: revive(fixture.routes) }, navRoutes(fixture.nav), c.path, c.override), c.expect);
    });
}
