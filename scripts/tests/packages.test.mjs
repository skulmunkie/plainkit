// packages.json declares which release package owns every file of core/dist (spec 2026-10-20-separate-packages-design.md, #1656, phase 0: declared, nothing moved).
// A failing case is a declaration that is wrong, not a case to weaken: FIX the packages.json entry or the import.
import '../../core/tests/needs-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO, CORE_ID, loadPackages, distFiles, claims, ownersOf, importsOf, allowedOwners, isSiteOnly } from '../packages.mjs';
import { listElementFolders } from '../../core/tools/element-folders.mjs';

const dist = path.join(REPO, 'core', 'dist');
const { data, packages, byId, core } = loadPackages();
const files = distFiles(dist);

test('packages.json is well formed: core first, unique ids, requires resolve and do not cycle', () => {
    assert.equal(packages[0].id, CORE_ID, 'FIX: the first package is core, "plainkit".');
    assert.equal(byId.size, packages.length, 'FIX: a package id is declared twice.');
    for (const p of packages) {
        assert.match(p.id, /^plainkit(\.[a-z]+)?$/, `${p.id}: ids are "plainkit" or "plainkit.<name>" (dotted, lower case).`);
        assert.ok(Array.isArray(p.requires), `${p.id}: requires is an array (empty for core).`);
        for (const r of p.requires) assert.ok(byId.has(r), `${p.id} requires ${r}, which is not declared.`);
        if (p.id !== CORE_ID) assert.ok(p.requires.includes(CORE_ID), `${p.id} must require core (exact version, spec section 8).`);
        assert.ok(!p.requires.includes(p.id), `${p.id} requires itself.`);
    }
    const depth = (id, seen = []) => { assert.ok(!seen.includes(id), `requires cycle: ${[...seen, id].join(' -> ')}`); for (const r of byId.get(id).requires) depth(r, [...seen, id]); };
    packages.forEach(p => depth(p.id));
});

test('the declared core ceilings equal the ones core/tests/package-size.test.mjs enforces (a one-way ratchet; that test stays core-only so the core carve-out copy still runs it)', () => {
    assert.ok(Number.isInteger(core.maxPackedBytes) && Number.isInteger(core.maxUnpackedBytes), 'FIX: core needs maxPackedBytes and maxUnpackedBytes.');
    const t = fs.readFileSync(path.join(REPO, 'core', 'tests', 'package-size.test.mjs'), 'utf8');
    const num = n => Number(new RegExp('const ' + n + ' = ([0-9_]+);').exec(t)[1].replace(/_/g, ''));
    assert.equal(core.maxPackedBytes, num('MAX_PACKED_BYTES'), 'FIX: lower both together (never raise).');
    assert.equal(core.maxUnpackedBytes, num('MAX_UNPACKED_BYTES'), 'FIX: lower both together (never raise).');
    for (const p of packages.filter(x => x.id !== CORE_ID))
        for (const k of ['maxPackedBytes', 'maxUnpackedBytes', 'maxZipBytes']) assert.ok(p[k] === null || Number.isInteger(p[k]), `${p.id}.${k} is null until the phase that builds the package measures it, then an integer.`);
});

test('every shipped file of dist is owned by exactly one package', () => {
    const multi = files.map(f => [f, ownersOf(f, packages)]).filter(([, o]) => o.length !== 1);
    assert.deepEqual(multi, [], `files claimed by more than one package: ${JSON.stringify(multi.slice(0, 5))}. FIX: packages.json claims must be disjoint.`);
    const dangling = [];
    for (const p of packages) for (const c of claims(p)) if (!files.some(f => (c.endsWith('/') ? f.startsWith(c) : f === c))) dangling.push(`${p.id}: ${c}`);
    assert.deepEqual(dangling, [], `claims that match no file of core/dist: ${dangling.join(', ')}. FIX: correct the name in packages.json (or remove the claim).`);
    const own = new Map(packages.map(p => [p.id, files.filter(f => ownersOf(f, packages)[0] === p.id).length]));
    assert.equal([...own.values()].reduce((a, b) => a + b, 0), files.length, 'every file counted once');
    assert.ok(own.get(CORE_ID) > 0);
});

test('an element meta says its package exactly when packages.json says so', () => {
    const tagOwner = new Map();
    for (const p of packages) for (const t of p.elements ?? []) { assert.ok(!tagOwner.has(t), `${t} is claimed twice`); tagOwner.set(t, p.id); }
    const tags = new Set();
    for (const e of listElementFolders(path.join(REPO, 'core'))) {
        const meta = JSON.parse(fs.readFileSync(path.join(e.dir, `${e.name}.meta.json`), 'utf8'));
        tags.add(meta.tag);
        const declared = tagOwner.get(meta.tag) ?? CORE_ID;
        assert.equal(meta.package ?? CORE_ID, declared, `${meta.tag}: meta.json package is ${meta.package ?? '(absent: core)'} but packages.json gives it to ${declared}. FIX: make them agree.`);
    }
    for (const t of tagOwner.keys()) assert.ok(tags.has(t), `packages.json names ${t}, which is no element.`);
});

test('P1: a package imports only itself and its requirements (no computed or literal import reaches an extra from core)', () => {
    const owner = f => ownersOf(f, packages)[0];
    const bad = [];
    for (const f of files.filter(x => x.endsWith('.js'))) {
        if (isSiteOnly(f, data)) continue;
        const ok = allowedOwners(owner(f), byId);
        for (const i of importsOf(dist, f)) {
            if (!fs.existsSync(path.join(dist, i))) continue;
            if (!ok.has(owner(i))) bad.push(`${f} (${owner(f)}) imports ${i} (${owner(i)})`);
        }
    }
    assert.deepEqual(bad, [], `imports across package boundaries:\n${bad.join('\n')}\nFIX: move the file to the package that needs it, or the import out of the file; never widen requires to hide one.`);
});

test('P1: no file of another package names an extra-owned file as a string either (a computed import would hide a user)', () => {
    const bad = [];
    for (const p of packages.filter(x => x.id !== CORE_ID)) {
        const names = claims(p).filter(c => c.endsWith('.js')).map(c => c.replace(/^(js|elements)\//, ''));
        for (const f of files.filter(x => x.endsWith('.js') && !isSiteOnly(x, data) && !ownersOf(x, packages).includes(p.id))) {
            const text = fs.readFileSync(path.join(dist, f), 'utf8');
            for (const n of names) if (new RegExp(`["'\`](?:[^"'\`\\n]*/)?${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'\`]`).test(text)) bad.push(`${f} names ${n} (${p.id})`);
        }
    }
    assert.deepEqual(bad, [], `string references to a file of another package:\n${bad.join('\n')}\nFIX: if it is a real use, the file does not belong in that package.`);
});
