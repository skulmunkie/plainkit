// The npm tarball (`npm pack` in core/) has a size ceiling and a closed list of top-level entries: a one-way ratchet (packaging plan, step 2).
// Measured after the trim (0.12.0, dist/AGENTS.md and dist/llms-full.txt left out): 1,387,281 packed / 6,137,778 unpacked bytes.
// The ceilings are that, rounded up by under 2%. NEVER RAISE THEM: make the package smaller (lower them when it shrinks).
import './needs-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_PACKED_BYTES = 1_415_000;
const MAX_UNPACKED_BYTES = 6_260_000;
const TOP_LEVEL = new Set(['dist', 'LICENSE', 'README.md', 'package.json']);
// dist/ is the runtime unit; these are the entries of dist/ the package may carry (dist/modules is the dev-tool unit, a separate download).
const DIST = new Set(['breakpoints.report.json', 'custom-elements.json', 'elements', 'elements.d.ts', 'elements.vue.d.ts', 'gallery', 'icons.svg', 'js', 'llms.txt',
    'manifest.json', 'plainkit.css', 'plainkit.js', 'plainkit.min.css', 'skills', 'tools', 'vscode.html-custom-data.json', 'web-types.json']);

const r = spawnSync('npm pack --dry-run --json', { cwd: root, encoding: 'utf8', shell: true, maxBuffer: 64 << 20 });
const info = r.status === 0 ? JSON.parse(r.stdout)[0] : null;

test('npm pack succeeds', () => assert.ok(info, `npm pack failed: ${r.stderr}`));

test('the tarball stays under its size ceilings', { skip: !info }, () => {
    assert.ok(info.size <= MAX_PACKED_BYTES, `packed ${info.size} bytes > ${MAX_PACKED_BYTES}. FIX: leave content out of core/package.json "files"; never raise the ceiling.`);
    assert.ok(info.unpackedSize <= MAX_UNPACKED_BYTES, `unpacked ${info.unpackedSize} bytes > ${MAX_UNPACKED_BYTES}. FIX: leave content out of core/package.json "files"; never raise the ceiling.`);
});

test('the tarball holds only the expected top-level entries', { skip: !info }, () => {
    const paths = info.files.map(f => f.path);
    const top = [...new Set(paths.map(p => p.split('/')[0]))].filter(n => !TOP_LEVEL.has(n));
    assert.deepEqual(top, [], `unexpected top-level entries in the package: ${top.join(', ')}. FIX: negate them in core/package.json "files", or add them to TOP_LEVEL here if they are a deliverable.`);
    const dist = [...new Set(paths.filter(p => p.startsWith('dist/')).map(p => p.split('/')[1]))].filter(n => !DIST.has(n));
    assert.deepEqual(dist, [], `unexpected entries in dist/ in the package: ${dist.join(', ')}. FIX: negate them in core/package.json "files", or add them to DIST here if consumers need them.`);
});
