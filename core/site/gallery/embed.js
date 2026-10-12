// The page <pk-gallery> frames: reads its options from the query string, mounts the gallery and, when there is no chrome to scroll
// inside, tells the embedding page how tall the content is so the frame can grow to fit.
import { mountGallery, setGallerySections } from './gallery.js';
import { parseQuery } from '../../js/gallery-options.js';
import { READY_MESSAGE, acceptedSections } from '../../js/gallery-sections.js';
import { on, h, addressOf } from '../../js/mount-support.js';

const doc = document, win = doc.defaultView, parent = win.parent;
const options = { chrome: 'full', ...parseQuery(new URL(addressOf(win).href).search) };
const host = doc.getElementById('gx-host');
if (options.chrome === 'full') doc.body.classList.add('site');

// The height goes out at most once per frame, and only when it moved by more than a pixel (lazy frames mounting would otherwise
// flood the parent with jumps). The target is the embedder's origin when the browser reports it, else '*' (the payload is one number).
let sent = -1; let queued = 0;
const target = (() => { try { return addressOf(win).ancestor || (doc.referrer ? new URL(doc.referrer).origin : '*'); } catch { return '*'; } })();
const flush = () => {
    queued = 0;
    const height = Math.ceil(host.getBoundingClientRect().height);
    if (Math.abs(height - sent) <= 1) return;
    sent = height;
    parent.postMessage({ type: 'pk-gallery-height', height }, target);
};
const tell = () => { if (!queued) queued = win.requestAnimationFrame(flush); };

// The embedding page adds sections to the Details drawer by message (js/gallery-sections.js); only that window is believed. Told it is ready, it answers.
on(win, 'message', e => { const sections = acceptedSections(e, parent, target); if (sections) setGallerySections(sections); });

mountGallery(host, options).then(() => {
    if (parent !== win) parent.postMessage({ type: READY_MESSAGE }, target);
    if (options.chrome === 'none' && parent !== win) { new win.ResizeObserver(tell).observe(host); tell(); }
}).catch(err => {
    host.replaceChildren(h(doc, 'pk-alert', { kind: 'danger', role: 'alert' }, `The gallery could not start: ${err.message}`));
});
