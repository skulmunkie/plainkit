// Loads the elements of navbar-frame.html, the page the navbar browser cases open in an iframe of a chosen width (media queries answer to the frame's width).
import { loadElements } from '../../js/loader.js';

// ?nonav drops the side nav: a header-only shell (the case for the main column of a shell with nothing in its nav slot).
if (location.search.includes('nonav')) document.querySelector('pk-side-nav')?.remove();
// ?nofooter drops the footer, ?bare everything but the body: a strip with nothing in it must not be drawn.
if (location.search.includes('nofooter') || location.search.includes('bare')) document.querySelector('[slot="footer"]')?.remove();
if (location.search.includes('bare')) for (const el of document.querySelectorAll('pk-app-shell > [slot="header"], pk-app-shell > [slot="nav"]')) el.remove();
// ?holdnav: the shell and the rest load first and the side nav stays undefined until window.releaseNav() (a real app loads it a moment later).
if (location.search.includes('holdnav')) {
    const nav = document.querySelector('pk-side-nav'); nav.remove();
    await loadElements(document);
    document.querySelector('pk-app-shell').append(nav);
    window.releaseNav = () => loadElements(document);
} else loadElements(document);
