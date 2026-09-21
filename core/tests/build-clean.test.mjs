// dist/js is exactly what the build produces: a leftover from a renamed or removed source must show up.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build, staleDistJs } from '../tools/build.mjs';

test('no file under dist/js is left over from a source that no longer exists', () => {
    const { out } = build({ write: false });
    assert.deepEqual(staleDistJs(out), [], 'run node tools/build.mjs (it removes them) and delete the source-less file from git');
});

test('staleDistJs lists files the build did not produce, including nested ones, and nothing else', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-stale-'));
    try {
        for (const f of ['dist/js/kept.js', 'dist/js/old.js', 'dist/js/sub/kept.js', 'dist/js/sub/gone.js', 'dist/other.js']) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), ''); }
        const out = new Map([['dist/js/kept.js', ''], ['dist/js/sub/kept.js', '']]);
        assert.deepEqual(staleDistJs(out, dir), ['dist/js/old.js', 'dist/js/sub/gone.js']);
        assert.deepEqual(staleDistJs(out, path.join(dir, 'nowhere')), []);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
