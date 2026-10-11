// Carve-out, split for parallelism (issue #1107): in its own copy of core/ outside the repository, the build is byte-for-byte the bootstrap output.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { source, skip, walk, rel, makeCopy, removeCopy } from './carveout-helpers.mjs';

let copy;
test('copy the Plainkit folder outside the repository', { skip }, () => { copy = makeCopy(); });

test('the copy rebuilds dist/, plainkit.css and the gallery data byte-for-byte', { skip }, () => {
    const r = spawnSync(process.execPath, ['tools/build.mjs'], { cwd: copy, encoding: 'utf8' });
    assert.equal(r.status, 0, /esbuild/.test(r.stderr) && /Cannot find (package|module)|ERR_MODULE_NOT_FOUND/.test(r.stderr) ? 'esbuild cannot be resolved from the copy: this checkout has no node_modules, run `npm ci`' : r.stderr);
    const files = [...walk(path.join(source, 'dist')).map(f => rel(source, f)), 'plainkit.css', 'site/gallery/gallery.data.js'];
    const different = files.filter(f => !fs.readFileSync(path.join(source, f)).equals(fs.readFileSync(path.join(copy, f))));
    assert.deepEqual(different, [], 'a rebuild in the copy differs from the bootstrap output: run node scripts/bootstrap.mjs');
    const extra = walk(path.join(copy, 'dist')).map(f => rel(copy, f)).filter(f => !fs.existsSync(path.join(source, f)));
    assert.deepEqual(extra, []);
});

test('clean up the copy', { skip }, () => removeCopy(copy));
