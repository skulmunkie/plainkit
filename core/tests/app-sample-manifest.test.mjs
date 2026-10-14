// #364 step 5: the manifests of the demo app (core/samples/app/manifests, the ones the Blazor sample embeds and a .NET test compares with its own copies) are valid and agree
// with the SDK modules they describe: same id, title, nav and route tree.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readManifest } from '../tools/app-manifest.mjs';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../samples/app');
const label = l => (typeof l === 'string' ? { label: l } : typeof l === 'function' ? { label: 'Order' } : {});
const routes = rs => rs.map(r => ({ path: r.path, page: r.page, ...label(r.label), ...(r.children ? { children: routes(r.children) } : {}) }));
const clean = o => JSON.parse(JSON.stringify(o));

for (const id of ['overview', 'orders', 'reports']) {
    test(`app sample manifest ${id} is valid and matches the SDK module`, async () => {
        const data = JSON.parse(fs.readFileSync(path.join(dir, 'manifests', `${id}.json`), 'utf8'));
        readManifest(data);
        const mod = (await import(pathToFileURL(path.join(dir, 'modules', `${id}.js`)).href)).default;
        assert.equal(mod.id, id);
        assert.equal(mod.title, data.title);
        assert.deepEqual(routes(mod.routes), data.routes);
        assert.deepEqual(clean((mod.nav?.() ?? []).map(({ id: i, title, route, icon, badge }) => ({ id: i, title, route, icon, badge }))), data.nav ?? []);
    });
}
