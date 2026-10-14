// The Gallery module's store (site/gallery/state.js, #1239): the pk-gallery-* localStorage keys of the old gallery are read once into the module's own namespace, bad values fall back to the defaults.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/store.js';
import { GALLERY_STATE, APP_THEME, chromeSettings } from '../site/gallery/state.js';

const fake = initial => { const m = new Map(Object.entries(initial)); return { m, getItem: k => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: k => void m.delete(k) }; };
const open = initial => { const storage = fake(initial); return { storage, gallery: createStore({ storage }).module('gallery', GALLERY_STATE) }; };

test('the old pk-gallery-* keys become the module\'s width, text size, drawer and drawer width, once', () => {
    const { storage, gallery } = open({ 'pk-gallery-width': 'phone', 'pk-gallery-scale': '1.3', 'pk-gallery-inspector': '1', 'pk-gallery-inspector-w': '420' });
    assert.deepEqual(['width', 'scale', 'inspector', 'w'].map(k => gallery.get(k)), ['phone', 1.3, '1', 420]);
    gallery.set('scale', 1.15);
    assert.equal(JSON.parse(storage.m.get('pk.gallery')).data.scale, 1.15, 'saved under the module\'s own key');
    assert.equal(createStore({ storage }).module('gallery', GALLERY_STATE).get('scale'), 1.15, 'the envelope wins over the old key from then on');
});

test('nothing stored: the drawer is undecided and the defaults hold; a wrong old value is ignored', () => {
    const fresh = open({}).gallery;
    assert.deepEqual(['width', 'scale', 'inspector', 'w'].map(k => fresh.get(k)), ['desktop', 1, '', 0]);
    const bad = open({ 'pk-gallery-width': 'wide', 'pk-gallery-scale': '9', 'pk-gallery-inspector': 'maybe' }).gallery;
    assert.deepEqual(['width', 'scale', 'inspector'].map(k => bad.get(k)), ['desktop', 1, '']);
});

test('the embed folds and theme: the old open and pk-site-theme keys are read once, the frame settings map onto the store (#1339)', () => {
    const { storage, gallery } = open({ 'pk-gallery-open': '["forms","data"]', 'pk-site-theme': 'light' });
    assert.deepEqual(gallery.get('open'), ['forms', 'data']);
    assert.equal(createStore({ storage }).module('app', APP_THEME).get('theme'), 'light');
    const bad = open({ 'pk-gallery-open': '{"x":1}' }).gallery;
    assert.deepEqual(bad.get('open'), [], 'a wrong old value falls back to the default');
    const settings = chromeSettings(gallery);
    assert.equal(settings.get('inspector'), null, 'undecided is null');
    settings.set('inspector', '1'); settings.set('inspector-w', '420');
    assert.deepEqual([settings.get('inspector'), settings.get('inspector-w')], ['1', 420]);
});
