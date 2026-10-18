// The npm tarball (`npm pack` in core/) has a size ceiling and a closed list of top-level entries: a one-way ratchet (packaging plan, step 2).
// Measured after leaving the plainkit-blazor skill (NuGet, the skills zip and Pages carry it), then llms-full.txt, descriptions.json, gallery/ and elements/api.full.json (the usage examples) out of the package (0.14+): 935,364 packed / 3,634,548 unpacked bytes.
// (Earlier: leaving llms-full.txt, descriptions.json, gallery/ and elements/api.full.json (the usage examples) out of the package (they ship on the Pages site and in the release zip; 0.14+): 1,056,218 packed / 4,135,277 unpacked bytes.
// Then the CEM attributes naming their field (type, default and description once, on the member) and a compact dist/manifest.json (#1253): 929,626 packed / 3,455,522 unpacked bytes.
// Then skill element tables without a repeated property column, a grouped elements index and the contributor sections of core/README.md moved to docs/core-development.md (#1253): 923,958 packed / 3,437,502 unpacked bytes.
// Then SHA-256 instead of SHA-384 SRI hashes in dist/manifest.json (still valid SRI; 567 entries x 16 random bytes, #1253): 915,745 packed / 3,429,025 unpacked bytes.
// Then the element tables of the skill references state their legend once (elements-index.md), not above every table, and drop an empty Values column (#1253): 914,256 packed / 3,389,474 unpacked bytes.
// Then the editor files' one-sentence summaries cut at 100 characters instead of 120 (the full text stays in descriptions.json) and the JSX and Vue typings naming each element's props once (a `...Props` interface, `keyof` instead of a repeated name list) (#1253): 908,581 / 3,367,469 bytes.
// Then the ~220 files the package leaves out (gallery, agent docs, descriptions.json ...) listed in their own dist/manifest.extras.json (kept out of the package) instead of in dist/manifest.json (#1253): 901,734 / 3,351,389 bytes.
// The ceilings (907,800 / 3,366,500; measured 901,734 / 3,351,389 on 2026-10-17). NEVER RAISE THEM: make the package smaller (lower them when it shrinks).
import './needs-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_PACKED_BYTES = 907_800;
const MAX_UNPACKED_BYTES = 3_366_500;
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

test('elements/api.full.json (api.json plus the usage examples) is left out of the package and api.json carries no examples (#1253)', { skip: !info }, () => {
    assert.ok(!info.files.some(f => f.path === 'dist/elements/api.full.json'), 'dist/elements/api.full.json is in the package. FIX: keep "!dist/elements/api.full.json" in core/package.json "files"; it ships on the Pages site and in the release zip.');
    const slim = JSON.parse(fs.readFileSync(path.join(root, 'dist', 'elements', 'api.json'), 'utf8'));
    const full = JSON.parse(fs.readFileSync(path.join(root, 'dist', 'elements', 'api.full.json'), 'utf8'));
    assert.ok(slim.every(e => !('examples' in e)) && full.every(e => e.examples.length > 0), 'api.json must not carry examples; api.full.json must carry them for every element.');
    assert.deepEqual(full.map(({ examples, ...rest }) => rest), slim, 'api.full.json must be api.json plus examples and nothing else.');
});

test('the plainkit-blazor skill is left out of the package; llms.txt links it at its Pages URL (#1253)', { skip: !info }, () => {
    assert.ok(!info.files.some(f => f.path.startsWith('dist/skills/plainkit-blazor/')), 'dist/skills/plainkit-blazor is in the package. FIX: keep "!dist/skills/plainkit-blazor" in core/package.json "files"; NuGet, the skills zip and the Pages site carry it.');
    assert.ok(info.files.some(f => f.path === 'dist/skills/plainkit-sdk/SKILL.md'), 'the plainkit-sdk skill stays in the package.');
    const text = fs.readFileSync(path.join(root, 'dist', 'llms.txt'), 'utf8');
    assert.ok(text.includes('](https://skulmunkie.github.io/plainkit/dist/skills/plainkit-blazor/SKILL.md)'), 'dist/llms.txt must link the plainkit-blazor skill at its Pages URL. FIX: scripts/build-agent-refs.mjs.');
    assert.ok(fs.existsSync(path.join(root, 'dist', 'skills', 'plainkit-blazor', 'SKILL.md')), 'dist/skills/plainkit-blazor must still be generated (NuGet, skills zip, Pages).');
});
