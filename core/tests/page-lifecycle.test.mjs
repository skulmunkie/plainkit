// js/page-lifecycle.js (#1022): the shared fixture cases, the helper's edges and a create/dispose leak check.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLifecycle, disposeWith } from '../js/page-lifecycle.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/page-lifecycle.json'), 'utf8'));
const tick = () => new Promise(r => setImmediate(r));

for (const c of fixture.cases) {
    test(`page lifecycle fixture: ${c.name}`, async () => {
        const out = { applied: [], rejected: [], aborted: [], changes: [] }, defs = {};
        const lc = createLifecycle({ onChange: s => out.changes.push([s.busy, s.error && `${s.error.label}: ${s.error.message}`]) });
        const def = id => defs[id] = (() => { const d = {}; d.promise = new Promise((res, rej) => { d.res = res; d.rej = rej; }); return d; })();
        for (const s of c.steps) {
            if (s.op === 'load') { const d = def(s.id); lc.load(sig => { sig.addEventListener('abort', () => out.aborted.push(s.id)); return d.promise; }).then(v => out.applied.push([s.id, v]), e => out.rejected.push([s.id, e])); }
            else if (s.op === 'run') { const d = def(s.id); lc.run(() => d.promise, s.label).catch(() => {}); }
            else if (s.op === 'resolve') defs[s.id].res(s.value);
            else if (s.op === 'reject') defs[s.id].rej(s.value);
            else lc[s.op]();
            await tick();
        }
        assert.deepEqual(out, c.expect);
    });
}

test('a rejection of run is rethrown and kept in state', async () => {
    const lc = createLifecycle();
    await assert.rejects(lc.run(() => Promise.reject(new Error('no')), 'save'), /no/);
    assert.deepEqual(lc.state().error, { label: 'save', message: 'no' });
});

test('disposeWith runs the disposer for a plain cleanup and for the thenable form', async () => {
    let n = 0, m = 0;
    disposeWith(() => m++, () => n++)();
    assert.deepEqual([n, m], [1, 1]);
    const thenable = Object.assign(() => m++, { then: ok => ok(() => m++) });
    const stop = await disposeWith(thenable, () => n++);
    stop();
    assert.deepEqual([n, m], [2, 2]);
});

test('100 create/dispose cycles with loads in flight settle nothing and notify nothing', async () => {
    let delivered = 0, changes = 0;
    for (let i = 0; i < 100; i++) {
        const lc = createLifecycle({ onChange: () => changes++ }), sigs = [];
        lc.load(s => { sigs.push(s); return new Promise(r => setImmediate(() => r(1))); }).then(() => delivered++);
        lc.dispose();
        assert.equal(sigs[0].aborted, true);
    }
    await tick(); await tick();
    assert.equal(delivered, 0);
    assert.equal(changes, 0);
});
