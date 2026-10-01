// The shared element-folder walker (tools/element-folders.mjs, #767): tier folders are optional, every consumer goes through it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listElementFolders, existingTierFolders, findElementFolder, elementFile, CORE } from '../tools/element-folders.mjs';

const make = layout => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pk-folders-'));
    for (const rel of layout) fs.mkdirSync(path.join(dir, rel), { recursive: true });
    return dir;
};

test('lists element folders across the tier folders that exist, sorted by name', () => {
    const dir = make(['elements/button', 'elements/alert', 'shells/app-shell', 'pages/login']);
    assert.deepEqual(listElementFolders(dir).map(e => [e.name, e.folder]), [['alert', 'elements'], ['app-shell', 'shells'], ['button', 'elements'], ['login', 'pages']]);
    assert.deepEqual([...existingTierFolders(dir)].sort(), ['elements', 'pages', 'shells']);
    assert.equal(findElementFolder('app-shell', dir).dir, path.join(dir, 'shells', 'app-shell'));
    assert.equal(elementFile('login', 'meta.json', dir), path.join(dir, 'pages', 'login', 'login.meta.json'));
    assert.throws(() => elementFile('nope', 'js', dir));
});

test('an absent tier folder is no error, and today everything is in core/elements', () => {
    assert.deepEqual(listElementFolders(make([])), []);
    const real = listElementFolders(CORE);
    assert.ok(real.length > 0 && real.every(e => e.dir.startsWith(path.join(CORE, e.folder))));
    for (const f of existingTierFolders(CORE)) assert.ok(['elements', 'components', 'pages', 'shells'].includes(f));
});
