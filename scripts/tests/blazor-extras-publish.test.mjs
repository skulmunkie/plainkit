// The pure parts of scripts/blazor-extras-publish.mjs (#1656 phase 2): which files an option set must and must not publish, and the payload ceilings.
// The publish itself (four dotnet publish runs) is the pack check of scripts/verify.mjs.
import '../../core/tests/needs-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SETS, checkSet, checkPayload, filesOfExtra, publishJobs, pool } from '../blazor-extras-publish.mjs';
import { loadPackages } from '../packages.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { data, packages } = loadPackages(root);
const walk = (d, rel = '') => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name), rel + e.name + '/') : [rel + e.name]);
const universe = walk(path.join(root, 'blazor', 'src', 'PlainKit.Blazor', 'wwwroot', 'plainkit'));

test('each extra owns files of the served tree, and no two extras own the same file', () => {
    const seen = new Map();
    for (const name of packages.filter(p => p.blazorOption).map(p => p.blazorOption)) {
        const files = filesOfExtra(name, packages, universe);
        assert.ok(files.length > 0, `FIX: the ${name} extra owns no served file`);
        for (const f of files) { assert.equal(seen.get(f), undefined, `FIX: ${f} is owned by ${seen.get(f)} and ${name}`); seen.set(f, name); }
    }
});

test('a published set that matches its declaration has no problems', () => {
    for (const set of SETS) {
        const published = universe.filter(f => set.declared === 'all' || packages.filter(p => p.blazorOption).every(p => !filesOfExtra(p.blazorOption, packages, [f]).length) || set.declared.some(n => filesOfExtra(n, packages, [f]).length));
        assert.deepEqual(checkSet(set, published, universe, packages), [], set.id);
    }
});

test('an undeclared extra that was published, a declared one that was not, and a lost core file are each named', () => {
    const core = SETS.find(s => s.id === 'core');
    assert.match(checkSet(core, universe, universe, packages).join('\n'), /dock extra is not declared but \d+ of its files were published/);
    const dock = SETS.find(s => s.id === 'dock');
    const without = universe.filter(f => f !== 'elements/dock.js');
    assert.match(checkSet(dock, without, universe, packages).join('\n'), /dock extra is declared but 1 of its files were not published \(first: elements\/dock\.js\)/);
    assert.match(checkSet(SETS.find(s => s.id === 'full'), universe.filter(f => f !== 'elements/button.js'), universe, packages).join('\n'), /core file\(s\) were not published \(first: elements\/button\.js\)/);
});

test('payload: over a ceiling, a missing ceiling and a core-only payload that is not smaller each fail; the recorded figures pass', () => {
    assert.deepEqual(checkPayload({ coreOnly: 10, full: 20 }, { coreOnly: 10, full: 20 }), []);
    assert.match(checkPayload({ coreOnly: 11, full: 20 }, { coreOnly: 10, full: 20 }).join(), /core-only|coreOnly payload is 11/);
    assert.match(checkPayload({ coreOnly: 10, full: 20 }, undefined).join(), /blazorPayload\.coreOnly/);
    assert.match(checkPayload({ coreOnly: 20, full: 20 }, { coreOnly: 20, full: 20 }).join(), /not smaller/);
});

test('packages.json records both payload ceilings as numbers once measured', () => {
    if (!data.blazorPayload) return; // recorded by node scripts/blazor-extras-publish.mjs --write
    for (const k of ['coreOnly', 'full']) assert.ok(Number.isInteger(data.blazorPayload[k]) && data.blazorPayload[k] > 0, `FIX: blazorPayload.${k}`);
    assert.ok(data.blazorPayload.coreOnly < data.blazorPayload.full);
});

test('publishJobs: by free memory, never more than the sets or under one, PK_EXTRAS_JOBS overrides', () => {
    assert.equal(publishJobs({ freeBytes: 16 * 2 ** 30, env: {} }), 4);
    assert.equal(publishJobs({ freeBytes: 1000 * 2 ** 20, env: {} }), 1);
    assert.equal(publishJobs({ freeBytes: 0, env: {} }), 1);
    assert.equal(publishJobs({ freeBytes: 16 * 2 ** 30, env: { PK_EXTRAS_JOBS: '1' } }), 1);
    assert.equal(publishJobs({ freeBytes: 0, env: { PK_EXTRAS_JOBS: '9' } }), 4);
    assert.equal(publishJobs({ freeBytes: 16 * 2 ** 30, env: { PK_EXTRAS_JOBS: 'x' } }), 4);
});

test('pool: results in input order, at most `limit` at once', async () => {
    let running = 0, max = 0;
    const out = await pool([0, 1, 2, 3, 4], 2, async (item, i) => {
        running++; max = Math.max(max, running);
        await new Promise(r => setTimeout(r, (5 - i) * 10));
        running--;
        return item * 2;
    });
    assert.deepEqual(out, [0, 2, 4, 6, 8]);
    assert.ok(max <= 2, `ran ${max} at once`);
});

test('pool: a failing worker rejects the run only after every started worker settled', async () => {
    let siblingDone = false;
    await assert.rejects(pool([0, 1], 2, async i => {
        if (i === 0) throw new Error('boom');
        try { await new Promise(r => setTimeout(r, 30)); } finally { siblingDone = true; }
    }), /boom/);
    assert.equal(siblingDone, true);
});
