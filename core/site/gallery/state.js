// What the Gallery keeps per viewer (js/store.js, the namespace pk.gallery), for the site app's Gallery module and for the embed page alike: the viewport and text size of the samples, whether the Details
// drawer is open ('' until the reader chooses, then '1' or '0') and its width, and the nav folds the reader opened (the embed's side nav). The old pk-gallery-* keys are read once, when nothing is stored
// yet (withLegacy). The Settings module opens the same namespace for its two controls.
import { withLegacy } from '../../js/store-extras.js';
import { createStore } from '../../js/store.js';

export const GALLERY_STATE = withLegacy({
    version: 1,
    defaults: { width: 'desktop', scale: 1, inspector: '', w: 0, open: [] },
    schema: { width: { enum: ['desktop', 'phone'] }, scale: { min: 0.5, max: 2 }, inspector: { enum: ['', '1', '0'] }, w: { min: 0, max: 4000 }, open: { maxLength: 4000 } },
    persist: ['width', 'scale', 'inspector', 'w', 'open'],
    legacy: { width: 'pk-gallery-width', scale: 'pk-gallery-scale', inspector: 'pk-gallery-inspector', w: 'pk-gallery-inspector-w', open: 'pk-gallery-open' },
});

// The app's namespace (pk.app: the theme the site app keeps). A page with no app, the embed, writes the reader's choice there, where the site app reads it (the old pk-site-theme key is read once).
export const APP_THEME = withLegacy({
    version: 1,
    defaults: { theme: 'dark' },
    schema: { theme: { enum: ['light', 'dark'] } },
    persist: ['theme'],
    legacy: { theme: 'pk-site-theme' },
});

// The frame's { get, set } for the Details drawer ('inspector': '1' | '0', null while undecided; 'inspector-w': pixels) over a store module of GALLERY_STATE.
export const chromeSettings = g => ({ get: key => (key === 'inspector' ? g.get(key) || null : g.get('w')), set: (key, text) => (key === 'inspector' ? g.set(key, text) : g.set('w', Number(text))) });

// A store of its own on the same namespace, for a module that is not the Gallery (the Settings module): free while the Gallery module is not on show.
export const galleryStore = () => createStore().module('gallery', GALLERY_STATE);
