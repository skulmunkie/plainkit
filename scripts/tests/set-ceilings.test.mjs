// scripts/set-ceilings.mjs: the owner's ceiling rule, pure parts only (no build, no dotnet).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OPTIONAL, ONE_WAY, applyPackages, applyPageWeight, parsePayload, planCeilings, plusOne } from '../set-ceilings.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const packagesText = fs.readFileSync(path.join(root, 'packages.json'), 'utf8');
const pagesText = fs.readFileSync(path.join(root, 'core', 'tests', 'page-weight.ceiling.json'), 'utf8');

test('every built package is classified exactly once', () => {
    for (const p of JSON.parse(packagesText).packages.filter(x => x.built)) {
        const n = [OPTIONAL, ONE_WAY].filter(l => l.includes(p.id)).length;
        assert.equal(n, 1, `FIX: classify ${p.id} in OPTIONAL or ONE_WAY in scripts/set-ceilings.mjs`);
    }
});

const data = {
    packages: [
        { id: 'plainkit', built: true, maxPackedBytes: 1, maxUnpackedBytes: 1, maxZipBytes: 1000 },
        { id: 'plainkit.audit', built: true, maxZipBytes: 1000, maxUnpackedBytes: 5000 },
        { id: 'plainkit.canvas', built: true, maxZipBytes: 35477, maxUnpackedBytes: 90000 },
        { id: 'plainkit.dock', built: true, maxZipBytes: 20000, maxUnpackedBytes: 60000 },
    ],
    blazorPayload: { coreOnly: 737420, full: 1048205 },
};
const pages = { table: { requests: 12, gzip: 19900, brotli: 17400 } };
const within = { packages: { plainkit: { zip: 900, unpacked: 9999 }, 'plainkit.audit': { zip: 900, unpacked: 4000 }, 'plainkit.canvas': { zip: 35000, unpacked: 80000 }, 'plainkit.dock': { zip: 19000, unpacked: 50000 } }, pageWeight: { table: { requests: 12, gzip: 19900, brotli: 17400 } }, blazorPayload: null };
const plan = (over, allow) => planCeilings({ packagesData: data, pageCeilings: pages, measured: { ...within, ...over }, allowPageWeight: allow });

test('an optional package over its ceiling is set to measured + 1%', () => {
    const r = plan({ packages: { ...within.packages, 'plainkit.canvas': { zip: 35500, unpacked: 80000 } } });
    assert.deepEqual(r.changes.map(c => [c.path, c.from, c.to]), [['plainkit.canvas.maxZipBytes', 35477, 35855]]);
    assert.deepEqual(r.refused, []);
});

test('core and audit are refused, and the optional change is still listed', () => {
    const r = plan({ packages: { ...within.packages, plainkit: { zip: 1001, unpacked: 1 }, 'plainkit.audit': { zip: 900, unpacked: 5001 }, 'plainkit.canvas': { zip: 35500, unpacked: 80000 } } });
    assert.deepEqual(r.refused.map(x => x.path).sort(), ['plainkit.audit.maxUnpackedBytes', 'plainkit.maxZipBytes']);
    assert.equal(r.changes.length, 1);
});

test('blazorPayload: full is set, coreOnly is refused, null is skipped', () => {
    assert.deepEqual(plan({ blazorPayload: { coreOnly: 1, full: 1050000 } }).changes.map(c => [c.path, c.to]), [['blazorPayload.full', 1060500]]);
    assert.deepEqual(plan({ blazorPayload: { coreOnly: 737421, full: 1 } }).refused.map(x => x.path), ['blazorPayload.coreOnly']);
    const none = plan({});
    assert.deepEqual([none.changes, none.refused], [[], []]);
});

test('page weight is refused unless the page is named', () => {
    const over = { pageWeight: { table: { requests: 13, gzip: 19905, brotli: 17400 } } };
    assert.deepEqual(plan(over).refused.map(x => x.path), ['table.requests', 'table.gzip']);
    assert.deepEqual(plan(over, ['table']).changes.map(c => [c.path, c.to]), [['table.requests', 13], ['table.gzip', 20105]]);
    assert.throws(() => plan(over, ['nope']));
});

test('applyPackages changes exactly one number and keeps the line endings', () => {
    const change = [{ path: 'plainkit.canvas.maxZipBytes', to: 99999999 }];
    for (const text of [packagesText.replace(/\r\n/g, '\n'), packagesText.replace(/\r?\n/g, '\r\n')]) {
        const out = applyPackages(text, change), a = text.split('\n'), b = out.split('\n');
        assert.equal(a.length, b.length);
        assert.equal(a.filter((l, i) => l !== b[i]).length, 1);
        assert.equal(out.includes('\r\n'), text.includes('\r\n'));
    }
    assert.throws(() => applyPackages(packagesText.replace('"packages": [', '"packages":  ['), change), /canonical/);
});

test('applyPageWeight replaces only the named number', () => {
    const out = applyPageWeight(pagesText, [{ path: 'table.gzip', to: 12345 }]);
    const a = pagesText.split('\n'), b = out.split('\n');
    assert.equal(a.filter((l, i) => l !== b[i]).length, 1);
    assert.match(out, /"table": \{ "requests": 12, "gzip": 12345,/);
    assert.equal(out.split('\r\n').length, pagesText.split('\r\n').length);
    assert.throws(() => applyPageWeight(pagesText, [{ path: 'nope.gzip', to: 1 }]));
});

test('parsePayload reads the extras-publish lines', () => {
    const lines = 'default  120 files under plainkit/, 700000 gzip bytes\nfull     150 files under plainkit/, 1048205 gzip bytes\ncore     100 files under plainkit/, 737420 gzip bytes\ndock     110 files under plainkit/, 800000 gzip bytes\n';
    assert.deepEqual(parsePayload(lines), { coreOnly: 737420, full: 1048205 });
    assert.equal(parsePayload('core     100 files under plainkit/, 737420 gzip bytes\n'), null);
});

test('plusOne rounds up', () => {
    assert.equal(plusOne(100), 101);
    assert.equal(plusOne(19905), 20105);
});
