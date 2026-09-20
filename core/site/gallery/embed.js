// The page <pk-gallery> frames: reads its options from the query string, mounts the gallery and, when there is no chrome to scroll
// inside, tells the embedding page how tall the content is so the frame can grow to fit.
import { mountGallery } from './gallery.js';
import { parseQuery } from '../../js/gallery-options.js';

const options = { chrome: 'full', ...parseQuery(location.search) };
const host = document.getElementById('gx-host');
if (options.chrome === 'full') document.body.classList.add('site');

const tell = () => parent.postMessage({ type: 'pk-gallery-height', height: Math.ceil(host.getBoundingClientRect().height) }, '*');

mountGallery(host, options).then(() => {
    if (options.chrome === 'none' && parent !== window) { new ResizeObserver(tell).observe(host); tell(); }
}).catch(err => {
    host.textContent = `The gallery could not start: ${err.message}`;
    host.setAttribute('role', 'alert');
});
