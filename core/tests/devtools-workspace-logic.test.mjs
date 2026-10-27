// The dev tools workspace without the gallery option: the Gallery tab shows a notice and the workspace opens on Files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { galleryAvailable, firstWorkspace, GALLERY_NOTICE } from '../modules/devtools/workspace-logic.js';

const KEYS = ['gallery', 'files', 'scorecard'];

test('the first tab is the one asked for, else Files when the gallery is missing, else the first offered', () => {
    assert.equal(firstWorkspace(KEYS, 'scorecard', false), 'scorecard');
    assert.equal(firstWorkspace(KEYS, 'gallery', false), 'gallery', 'an explicit Gallery link still shows the notice');
    assert.equal(firstWorkspace(KEYS, undefined, true), 'gallery');
    assert.equal(firstWorkspace(KEYS, undefined, false), 'files');
    assert.equal(firstWorkspace(['gallery', 'scorecard'], null, false), 'gallery', 'no Files tab offered: the first one');
});

test('the gallery counts as missing only when its page answers not ok', async () => {
    assert.equal(await galleryAvailable('x', false), false);
    assert.equal(await galleryAvailable('x', true, async () => { throw new Error('unused'); }), true);
    assert.equal(await galleryAvailable('x', undefined, async () => ({ ok: false, status: 404 })), false);
    assert.equal(await galleryAvailable('x', undefined, async () => ({ ok: true })), true);
    assert.equal(await galleryAvailable('x', undefined, async () => { throw new TypeError('offline'); }), true);
});

test('the notice names the option', () => assert.match(GALLERY_NOTICE.join(' '), /PkExtra\.Gallery/));
