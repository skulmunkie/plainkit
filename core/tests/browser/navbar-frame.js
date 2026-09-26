// Loads the elements of navbar-frame.html, the page the navbar browser cases open in an iframe of a chosen width (media queries answer to the frame's width).
import { loadElements } from '../../js/loader.js';

// ?nonav drops the side nav: a header-only shell (the case for the main column of a shell with nothing in its nav slot).
if (location.search.includes('nonav')) document.querySelector('pk-side-nav')?.remove();
// ?nofooter drops the footer, ?bare everything but the body: a strip with nothing in it must not be drawn.
if (location.search.includes('nofooter') || location.search.includes('bare')) document.querySelector('[slot="footer"]')?.remove();
if (location.search.includes('bare')) for (const el of document.querySelectorAll('pk-app-shell > [slot="header"], pk-app-shell > [slot="nav"]')) el.remove();
loadElements(document);
