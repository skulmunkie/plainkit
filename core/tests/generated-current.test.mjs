// Every file tools/build.mjs generates is current: what the build would write equals what is on disk. That covers plainkit.css, the element modules,
// gallery.data.js, api.current.json, dist/ and the Files page's snapshot (site/files/snapshot.json, which holds every other source and generated file
// of core/ but never itself or dist/). The snapshot goes stale with any edit under core/, so run node core/tools/build.mjs before committing.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../tools/build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const norm = t => t.replace(/\r\n/g, '\n');
const { out } = build({ write: false });

test('every generated file on disk is what the build produces (run node core/tools/build.mjs when it fails)', () => {
    const stale = [...out].filter(([f, text]) => !fs.existsSync(path.join(root, f)) || norm(fs.readFileSync(path.join(root, f), 'utf8')) !== norm(text)).map(([f]) => f);
    assert.deepEqual(stale, [], 'stale or missing generated files: run node core/tools/build.mjs');
});

test('the Files snapshot is deterministic, current, and does not contain itself or dist/', () => {
    const snap = JSON.parse(out.get('site/files/snapshot.json'));
    assert.equal(snap.generated, null, 'a timestamp would make every build differ');
    const paths = snap.files.map(f => f.path);
    assert.deepEqual(paths, [...paths].sort(), 'files are sorted by path, the same on every platform');
    assert.ok(!paths.includes('site/files/snapshot.json'), 'the snapshot must not include itself');
    assert.ok(!paths.some(p => p.startsWith('dist/')), 'dist/ is not part of the snapshot');
    assert.ok(paths.includes('site/gallery/gallery.data.js') && paths.includes('plainkit.css'), 'generated sources are in the snapshot');
    const disk = JSON.parse(fs.readFileSync(path.join(root, 'site', 'files', 'snapshot.json'), 'utf8'));
    assert.deepEqual(disk.files.map(f => f.path), paths, 'a file was added or removed under core/: run node core/tools/build.mjs');
});
