// tools/build.mjs is deterministic, and what `node scripts/bootstrap.mjs` left on disk is what the build produces. Generated files are not in git: this
// proves the build (two runs give the same bytes, the same files, no timestamp) and that the working tree's copy came from it, not that a committed copy
// is fresh. That covers plainkit.css, the element modules, gallery.data.js, api.current.json, dist/ and the Files page's snapshot (site/files/snapshot.json,
// which holds every other source and generated file of core/ but never itself or dist/). The snapshot changes with any edit under core/, so run
// node scripts/bootstrap.mjs after editing sources.
import './needs-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../tools/build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const norm = t => t.replace(/\r\n/g, '\n');
const { out } = build({ write: false });

test('the build is deterministic: a second run produces the same files with the same bytes', () => {
    const { out: again } = build({ write: false });
    assert.deepEqual([...again.keys()], [...out.keys()], 'the same files in the same order');
    const differing = [...out].filter(([f, text]) => again.get(f) !== text).map(([f]) => f);
    assert.deepEqual(differing, [], 'a file differs between two builds of the same sources');
});

test('every generated file on disk is what the build produces (run node scripts/bootstrap.mjs when it fails)', () => {
    const stale = [...out].filter(([f, text]) => !fs.existsSync(path.join(root, f)) || norm(fs.readFileSync(path.join(root, f), 'utf8')) !== norm(text)).map(([f]) => f);
    assert.deepEqual(stale, [], 'stale or missing generated files: run node scripts/bootstrap.mjs');
});

test('the Files snapshot is deterministic, consistent, and does not contain itself or dist/', () => {
    const snap = JSON.parse(out.get('site/files/snapshot.json'));
    assert.equal(snap.generated, null, 'a timestamp would make every build differ');
    const paths = snap.files.map(f => f.path);
    assert.deepEqual(paths, [...paths].sort(), 'files are sorted by path, the same on every platform');
    assert.ok(!paths.includes('site/files/snapshot.json'), 'the snapshot must not include itself');
    assert.ok(!paths.some(p => p.startsWith('dist/')), 'dist/ is not part of the snapshot');
    assert.ok(paths.includes('site/gallery/gallery.data.js') && paths.includes('plainkit.css'), 'generated sources are in the snapshot');
    const disk = JSON.parse(fs.readFileSync(path.join(root, 'site', 'files', 'snapshot.json'), 'utf8'));
    assert.deepEqual(disk.files.map(f => f.path), paths, 'a file was added or removed under core/ since the last bootstrap: run node scripts/bootstrap.mjs');
});
