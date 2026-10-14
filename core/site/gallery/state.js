// What the Gallery module of the site app keeps per viewer (js/store.js, the namespace pk.gallery): the viewport and text size of the samples, whether the Details drawer is open ('' until the reader
// chooses, then '1' or '0') and its width. The old pk-gallery-* keys are read once, when nothing is stored yet (withLegacy). The Settings module opens the same namespace for its two controls.
import { withLegacy } from '../../js/store-extras.js';
import { createStore } from '../../js/store.js';

export const GALLERY_STATE = withLegacy({
    version: 1,
    defaults: { width: 'desktop', scale: 1, inspector: '', w: 0 },
    schema: { width: { enum: ['desktop', 'phone'] }, scale: { min: 0.5, max: 2 }, inspector: { enum: ['', '1', '0'] }, w: { min: 0, max: 4000 } },
    persist: ['width', 'scale', 'inspector', 'w'],
    legacy: { width: 'pk-gallery-width', scale: 'pk-gallery-scale', inspector: 'pk-gallery-inspector', w: 'pk-gallery-inspector-w' },
});

// A store of its own on the same namespace, for a module that is not the Gallery (the Settings module): free while the Gallery module is not on show.
export const galleryStore = () => createStore().module('gallery', GALLERY_STATE);
