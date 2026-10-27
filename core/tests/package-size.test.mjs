// The npm tarball (`npm pack` in core/) has a size ceiling and a closed list of top-level entries: a one-way ratchet (packaging plan, step 2).
// (The agent skills left the package entirely in #1656: Pages serves them at skills/. Measured after leaving the plainkit-blazor skill, then llms-full.txt, descriptions.json, gallery/ and elements/api.full.json (the usage examples) out of the package (0.14+): 935,364 packed / 3,634,548 unpacked bytes.
// (Earlier: leaving llms-full.txt, descriptions.json, gallery/ and elements/api.full.json (the usage examples) out of the package (they ship on the Pages site and in the release zip; 0.14+): 1,056,218 packed / 4,135,277 unpacked bytes.
// Then the CEM attributes naming their field (type, default and description once, on the member) and a compact dist/manifest.json (#1253): 929,626 packed / 3,455,522 unpacked bytes.
// Then skill element tables without a repeated property column, a grouped elements index and the contributor sections of core/README.md moved to docs/core-development.md (#1253): 923,958 packed / 3,437,502 unpacked bytes.
// Then SHA-256 instead of SHA-384 SRI hashes in dist/manifest.json (still valid SRI; 567 entries x 16 random bytes, #1253): 915,745 packed / 3,429,025 unpacked bytes.
// Then the element tables of the skill references state their legend once (elements-index.md), not above every table, and drop an empty Values column (#1253): 914,256 packed / 3,389,474 unpacked bytes.
// Then the editor files' one-sentence summaries cut at 100 characters instead of 120 (the full text stays in descriptions.json) and the JSX and Vue typings naming each element's props once (a `...Props` interface, `keyof` instead of a repeated name list) (#1253): 908,581 / 3,367,469 bytes.
// Then the ~220 files the package leaves out (gallery, agent docs, descriptions.json ...) listed in their own dist/manifest.extras.json (kept out of the package) instead of in dist/manifest.json (#1253): 901,811 / 3,351,632 bytes.
// Then (agent/1253-headroom-5) only the first example of each element in the skill element references, the markup, script or module header of templates, patterns and tools over 3,000 characters, and the module headers moved to references/full/ (left out of the package: the Pages site, the skills zip and NuGet carry it), json props legend once, and no empty defaults or `reflects: false` in custom-elements.json and web-types.json: 875,303 / 3,242,616 bytes (from 904,065 / 3,361,366 on main).
// Then (#1656 phase 1) the 33 dev-tool helper files of dist/js left the package for the plainkit.tools artifact (packages.json; the audit-free import graph test scripts/tests/packages.test.mjs proves no core file imports them): 887,507 / 3,277,473 on main before, 845,001 / 3,168,976 after. The ceilings go back down to the measurement plus 0.5 percent (850,000 / 3,185,000); the stopgap raise (900,000 / 3,350,000) is undone.
// Then (#1656) the agent skills left the package for the Pages site (skills/, scripts/skills-site.mjs): 648,336 packed / 2,493,363 unpacked bytes (from about 861,900 / 3,219,900 with them). The ceilings went DOWN to 660,000 / 2,540,000, a ratchet again; the owner raise of 2026-10-20 is gone with the skills, which were most of it.
// Then (#1656 phase 3b) pk-canvas, its viewport and logic helpers (js/viewport-logic.js, canvas-geometry/rulers/select/style.js) and the SVG toolkit (js/svg/) left the package for the plainkit.canvas artifact (packages.json), after the skills move (648,336 / 2,493,363 plus the canvas layers C2/C3 and the SVG model S3): 594,818 / 2,328,751 after both moves. The ceilings go down to the measurement plus 1 percent (600,800 / 2,352,100).
// Then (#1656 phase 3c) pk-markdown, pk-markdown-editor and js/markdown/ left the package for the plainkit.markdown artifact (packages.json), after queue 4 had grown it to 601,835 / 2,352,3xx: 594,504 / 2,331,383 after. The ceilings go down to the measurement plus 0.5 percent (597,500 / 2,343,100).
// Then (#1656 relocation) pk-dock and its seven js/dock-*.js left for the plainkit.dock artifact (packages.json): 597,315 / 2,338,994 before, 584,620 / 2,300,918 after (12,695 packed freed). The ceilings go down to the measurement plus 0.5 percent (587,500 / 2,312,400).
// Then (#1656 relocation) the editor and IDE metadata (custom-elements.json, web-types.json, vscode.html-custom-data.json, elements.d.ts, elements.vue.d.ts: 893 KB, no runtime reader) left for the plainkit.ide artifact (packages.json): 586,151 / 2,312,345 before, 402,675 / 1,419,663 after (183,476 packed / 892,682 unpacked freed). The ceilings go down to the measurement plus 1 percent (406,700 / 1,433,900).
// Then (#1656 relocation) elements/api.json (484,579 bytes, read only by the dev-tool modules, the Blazor generator and the skills build) left for the plainkit.tools artifact (packages.json; the npm package has no module that reads them): 405,994 / 1,432,519 before, 280,547 / 948,240 after (125,447 packed / 484,279 unpacked freed). The ceilings go down to the measurement plus 1 percent (283,300 / 957,700); plainkit.tools goes to 781,100 unpacked / 255,700 zip. breakpoints.report.json stays: the Custom SDK export reads it from the runtime manifest.
// The previous ceilings (900,000 / 3,350,000). Owner decision 2026-10-20: headroom is raised once, by about 16 KB packed / 57 KB unpacked, because capping the package was capping new components; the long-term answer is separate packages for the larger components (#1656), after which the ceilings go back down. Until then no further raise without the owner: make the package smaller.
import './needs-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_PACKED_BYTES = 283_300;
const MAX_UNPACKED_BYTES = 957_700;
const TOP_LEVEL = new Set(['dist', 'LICENSE', 'README.md', 'package.json']);
// dist/ is the runtime unit; these are the entries of dist/ the package may carry (dist/modules is the dev-tool unit, a separate download).
const DIST = new Set(['breakpoints.report.json', 'elements', 'icons.svg', 'js', 'llms-full.txt', 'llms.txt', 'themes',
    'manifest.json', 'plainkit.css', 'plainkit.js', 'plainkit.min.css', 'tools']);

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
    assert.ok(!links.some(l => l.startsWith('skills/')), 'dist/llms.txt links a skill by a relative path; the skills are not in dist (#1656), link their Pages URL. FIX: scripts/build-agent-refs.mjs.');
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

test('the agent skills are not in the package: Pages serves them at skills/ and llms.txt links them there (#1656)', { skip: !info }, () => {
    assert.ok(!info.files.some(f => f.path.startsWith('dist/skills/')), 'dist/skills is in the package. FIX: the skills are generated into dist-skills/ (scripts/build-skills.mjs), served by Pages at skills/ and attached to the release; nothing under core/dist/skills.');
    const text = fs.readFileSync(path.join(root, 'dist', 'llms.txt'), 'utf8');
    assert.ok(text.includes('](https://skulmunkie.github.io/plainkit/skills/plainkit-sdk/SKILL.md)') && text.includes('](https://skulmunkie.github.io/plainkit/skills/plainkit-blazor/SKILL.md)'), 'dist/llms.txt must link both skills at their Pages URLs. FIX: scripts/build-agent-refs.mjs.');
    assert.ok(fs.existsSync(path.join(root, '..', 'dist-skills', 'plainkit-blazor', 'SKILL.md')), 'dist-skills must still be generated (Pages, the skills zip).');
});
