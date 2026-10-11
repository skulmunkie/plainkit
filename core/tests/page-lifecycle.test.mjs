// js/page-lifecycle.js (#1022): the shared fixture cases, the helper's edges and a create/destroy leak check.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLifecycle, disposeWith } from '../js/page-lifecycle.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/page-lifecycle.json'), 'utf8'));
const tick = () => new Promise(r => setImmediate(r));
// Like createPage: busy is counted, a rejection sets the status once and is rethrown.
const stubPage = out => ({
    async busy(fn) { out.busy++; try { return await fn(); } catch (e) { out.pageErrors++; throw e; } finally { out.busy--; } },
    setError() { out.pageErrors++; },
});

for (const c of fixture.cases) {
    test(`page lifecycle fixture: ${c.name}`, async () => {
        const out = { states: [], applied: [], rejected: [], aborted: [], runs: [], pageErrors: 0, busy: 0 }, defs = {}, ext = new AbortController();
        const life = createLifecycle({ page: stubPage(out), signal: ext.signal });
        const def = id => defs[id] = (() => { const d = {}; d.promise = new Promise((res, rej) => { d.res = res; d.rej = rej; }); return d; })();
        const err = v => v === 'AbortError' ? Object.assign(new Error('aborted'), { name: 'AbortError' }) : v;
        let pending;
        const loadFn = sig => { const id = pending; sig.addEventListener('abort', () => out.aborted.push(id)); return defs[id].promise; };
        const track = (id, p) => p?.then(v => out.applied.push([id, v]), e => out.rejected.push([id, e]));
        for (const s of c.steps) {
            if (s.op === 'load') { def(pending = s.id); track(s.id, life.load('k', loadFn)); }
            else if (s.op === 'refresh') { def(pending = s.id); track(s.id, life.refresh()); 
            } else if (s.op === 'run') {
                const d = def(s.id);
                life.run(s.label, () => d.promise).then(v => out.runs.push([s.id, `ok:${v}`]), e => out.runs.push([s.id, `err:${e}`]));
            } else if (s.op === 'resolve') defs[s.id].res(s.value);
            else if (s.op === 'reject') defs[s.id].rej(err(s.value));
            else if (s.op === 'abort') ext.abort();
            else life.destroy();
            await tick();
            out.states.push(life.state);
        }
        assert.deepEqual(out, c.expect);
    });
}

test('load reports loading synchronously and passes the signal to the callback', () => {
    const life = createLifecycle();
    let seen;
    life.load('k', async sig => { seen = sig; });
    assert.equal(life.state, 'loading');
    assert.equal(seen.aborted, false, 'the callback ran before load returned');
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

test('100 create/destroy cycles with loads in flight settle nothing and leave no listeners on the external signal', async () => {
    let delivered = 0;
    const ext = new AbortController();
    for (let i = 0; i < 100; i++) {
        const life = createLifecycle({ signal: ext.signal }), sigs = [];
        life.load('k', s => { sigs.push(s); return new Promise(r => setImmediate(() => r(1))); }).then(() => delivered++);
        life.destroy();
        assert.equal(sigs[0].aborted, true);
    }
    await tick(); await tick();
    assert.equal(delivered, 0);
});
