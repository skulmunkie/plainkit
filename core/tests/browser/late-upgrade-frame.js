// Loads the elements of late-upgrade-frame.html, the page the late-upgrade layout-shift cases open in an iframe. ?hold=pk-navbar,pk-breadcrumb leaves those tags undefined
// until window.release() (a real app gets them a moment after the first paint: the module arrives late), so a case measures what the page does when they upgrade.
import { loadElements } from '../../js/loader.js';

const hold = new URLSearchParams(location.search).get('hold')?.split(',').filter(Boolean) ?? [];
const held = hold.length ? [...document.querySelectorAll(hold.join(','))].map(el => ({ el, parent: el.parentNode, next: el.nextSibling })) : [];
for (const h of held) h.el.remove();
await loadElements(document);
for (const h of held) h.parent.insertBefore(h.el, h.next);
window.release = () => loadElements(document);
window.ready = true;
