// The page <pk-gallery> frames: reads its options from the query string, mounts the gallery and, when there is no chrome to scroll
// inside, tells the embedding page how tall the content is so the frame can grow to fit.
import { mountGallery } from './gallery.js';
import { parseQuery } from '../../js/gallery-options.js';

const options = { chrome: 'full', ...parseQuery(location.search) };
const host = document.getElementById('gx-host');
if (options.chrome === 'full') document.body.classList.add('site');

// The height goes out at most once per frame, and only when it moved by more than a pixel (lazy frames mounting would otherwise
// flood the parent with jumps). The target is the embedder's origin when the browser reports it, else '*' (the payload is one number).
let sent = -1; let queued = 0;
const target = (() => { try { return location.ancestorOrigins?.[0] || (document.referrer ? new URL(document.referrer).origin : '*'); } catch { return '*'; } })();
const flush = () => {
    queued = 0;
    const height = Math.ceil(host.getBoundingClientRect().height);
    if (Math.abs(height - sent) <= 1) return;
    sent = height;
    parent.postMessage({ type: 'pk-gallery-height', height }, target);
};
const tell = () => { if (!queued) queued = requestAnimationFrame(flush); };

mountGallery(host, options).then(() => {
    if (options.chrome === 'none' && parent !== window) { new ResizeObserver(tell).observe(host); tell(); }
}).catch(err => {
    host.textContent = `The gallery could not start: ${err.message}`;
    host.setAttribute('role', 'alert');
});
