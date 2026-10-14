// The npm tarball (`npm pack` in core/) has a size ceiling and a closed list of top-level entries: a one-way ratchet (packaging plan, step 2).
// Measured after leaving llms-full.txt, descriptions.json and gallery/ out of the package (they ship on the Pages site and in the release zip; 0.14+): 1,076,288 packed / 4,210,287 unpacked bytes.
// The ceilings leave about 14 KB of headroom for new work. NEVER RAISE THEM: make the package smaller (lower them when it shrinks).
import './needs-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_PACKED_BYTES = 1_090_000;
const MAX_UNPACKED_BYTES = 4_230_000;
const TOP_LEVEL = new Set(['dist', 'LICENSE', 'README.md', 'package.json']);
// dist/ is the runtime unit; these are the entries of dist/ the package may carry (dist/modules is the dev-tool unit, a separate download).
const DIST = new Set(['breakpoints.report.json', 'custom-elements.json', 'elements', 'elements.d.ts', 'elements.vue.d.ts', 'icons.svg', 'js', 'llms-full.txt', 'llms.txt',
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

test('every relative link in dist/llms.txt resolves to a file in the package', { skip: !info }, () => {
    const packed = new Set(info.files.map(f => f.path));
    const text = fs.readFileSync(path.join(root, 'dist', 'llms.txt'), 'utf8');
    const links = [...text.matchAll(/\]\(([^)\s]+)\)/g)].map(m => m[1].split('#')[0]).filter(l => l && !/^[a-z]+:/i.test(l));
    assert.ok(links.length > 5);
    const dead = links.filter(l => !packed.has('dist/' + l));
    assert.deepEqual(dead, [], `dist/llms.txt links to files the package leaves out: ${dead.join(', ')}. FIX: change scripts/build-agent-refs.mjs or core/package.json "files".`);
});

test('descriptions.json is left out of the package and llms.txt points at its Pages URL (#1253)', { skip: !info }, () => {
    assert.ok(!info.files.some(f => f.path === 'dist/descriptions.json'), 'dist/descriptions.json is in the package. FIX: keep "!dist/descriptions.json" in core/package.json "files"; it ships on the Pages site and in the release zip.');
    const text = fs.readFileSync(path.join(root, 'dist', 'llms.txt'), 'utf8');
    assert.ok(text.includes('https://skulmunkie.github.io/plainkit/dist/descriptions.json'), 'dist/llms.txt must link the descriptions.json URL. FIX: scripts/build-agent-refs.mjs.');
    assert.ok(fs.existsSync(path.join(root, 'dist', 'descriptions.json')), 'dist/descriptions.json must still be generated (runtime zip and Pages).');
});

test('dist/gallery is left out of the package: the Pages site and the release zip carry it, <pk-gallery> says so when it is missing (#1253)', { skip: !info }, () => {
    assert.ok(!info.files.some(f => f.path.startsWith('dist/gallery/')), 'dist/gallery is in the package. FIX: keep "!dist/gallery" in core/package.json "files"; it ships on the Pages site and in the release zip.');
    assert.ok(fs.existsSync(path.join(root, 'dist', 'gallery', 'embed.html')), 'dist/gallery must still be generated (runtime zip, Pages, Blazor).');
});
