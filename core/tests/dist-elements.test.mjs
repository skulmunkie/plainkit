// The shipped shape does not depend on where an element's source folder is (#767): dist/elements/<name>.js is named by the element, never by its tier folder,
// so a batch of scripts/move-tiers.mjs must leave this list unchanged. Usable before and after a batch: the expectation is derived from the element names,
// not from a path, and no tier folder name may leak into dist.
import './needs-bootstrap.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadElementSources } from '../tools/build.mjs';
import { checkFolders } from '../tools/tiers.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist/elements');

test('dist/elements holds exactly one <name>.js per element, plus registry.js and api.json, and no tier folder', () => {
    const want = [...loadElementSources().map(e => `${e.name}.js`), 'registry.js', 'api.json'].sort();
    const have = fs.readdirSync(dist).sort();
    assert.deepEqual(have, want);
    for (const tierFolder of ['components', 'pages', 'shells']) assert.ok(!fs.existsSync(path.join(root, 'dist', tierFolder)), `dist/${tierFolder} must not exist: the tier folders are source layout only`);
});

test('C2 (tier equals folder) is gated per tier folder: silent until the folder exists, then it names the misplaced element', () => {
    const items = [{ name: 'tabs', tier: 'component', folder: 'elements' }, { name: 'app-shell', tier: 'shell', folder: 'shells' }, { name: 'button', tier: 'element', folder: 'elements' }];
    assert.deepEqual(checkFolders(items, new Set()), [], 'no tier folder exists yet: nothing to enforce');
    assert.deepEqual(checkFolders(items, new Set(['shells'])), [], 'shells exists and holds the shell');
    const f = checkFolders(items, new Set(['shells', 'components']));
    assert.deepEqual(f.map(x => `${x.rule} ${x.element}`), ['C2 tabs']);
    assert.deepEqual(checkFolders([{ name: 'x', tier: 'element', folder: 'pages' }], new Set(['pages'])).map(x => x.element), ['x'], 'a base element may not sit in a tier folder');
});
