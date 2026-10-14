// The Gallery module's store (site/gallery/state.js, #1239): the pk-gallery-* localStorage keys of the old gallery are read once into the module's own namespace, bad values fall back to the defaults.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/store.js';
import { GALLERY_STATE } from '../site/gallery/state.js';

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
