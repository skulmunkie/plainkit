// The page the pk-grid browser cases open in an iframe of a chosen width and height (media queries answer to the frame). ?v=tablet|stack|fill|show picks the content.
import { loadElements } from '../../js/loader.js';

const v = new URLSearchParams(location.search).get('v');
const mk = (tag, attrs = {}, text) => { const e = document.createElement(tag); for (const [k, x] of Object.entries(attrs)) e.setAttribute(k, x); if (text) e.textContent = text; return e; };
const b = document.body; b.style.margin = '0';
if (v === 'tablet' || v === 'stack') {
    const g = mk('pk-grid', { id: 'g', tracks: 'repeat(12, minmax(0, 1fr))', 'tablet-tracks': 'repeat(6, minmax(0, 1fr))', gap: 'none' });
    if (v === 'stack') g.setAttribute('stack-below', 'tablet');
    for (const n of [6, 6, 12]) g.append(mk('div', { 'data-col-span': n }, 'c' + n));
    b.append(g);
} else if (v === 'fill') {
    b.style.cssText = 'margin:0;display:flex;flex-direction:column;block-size:100vh';
    b.append(mk('div', { id: 'bar' }, 'Header'));
    const g = mk('pk-grid', { id: 'g', fill: '', rows: 'minmax(0, 1fr) minmax(0, 3fr)', tracks: 'repeat(2, minmax(0, 1fr))', gap: 'none' });
    for (let i = 0; i < 4; i++) g.append(mk('div', {}, 'cell ' + i));
    b.append(g);
} else if (v === 'show') {
    b.append(mk('div', { id: 'above-tablet', 'data-show-above': 'tablet' }, 'desktop only'), mk('div', { id: 'below-tablet', 'data-hide-above': 'tablet' }, 'tablet and below'),
        mk('div', { id: 'above-phone', 'data-show-above': 'phone' }, 'not on a phone'), mk('div', { id: 'phone-only', 'data-hide-above': 'phone' }, 'phone only'));
}
loadElements(document);
