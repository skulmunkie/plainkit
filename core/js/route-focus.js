// What a route change does for a reader who cannot see it (#364): focus moves to the page's h1 (else the main region), a polite live region says
// "<label>, page loaded", and the main region scrolls into view. mountApp keeps its own copy of the focus step (the app entry may not grow); the Blazor PkApp reaches this through
// the bridge's routeChanged, so the behaviour is written once. A module of its own so the Blazor bridge can import it without the app entry.
import { loadElements } from './loader.js';

// The page's level 1: in the light DOM first (mountApp pages), else the first one inside an open shadow root below it (page elements draw their heading in their own shadow tree, #1335).
const H1 = 'h1,pk-heading[level="1"]';
export function findHeading(root) {
    const own = root.querySelector(H1);
    if (own) return own;
    for (const host of root.querySelectorAll?.('*') ?? []) {
        const found = host.shadowRoot && findHeading(host.shadowRoot);
        if (found) return found;
    }
    return null;
}

// `error`: the page failed; the boundary's alert announces itself, so only its own placeholder title takes focus and nothing is announced.
export function pageLoaded(main, live, label, error = false) {
    const target = findHeading(main) ?? main, own = target.closest('pk-empty-state'), go = () => target.focus({ preventScroll: true });
    if (error && !own) return;
    if (!error) live.textContent = `${label}, page loaded`;
    target.tabIndex = -1;
    // A boundary title's elements may be undefined yet: focus given before they upgrade is lost.
    own ? loadElements(main).then(go) : go();
    main.scrollIntoView?.({ block: 'nearest' });
}

// The Blazor entry: the document title ("<label> - <site>", or the site alone on the home page), then pageLoaded on `#pk-main` with a live region this
// creates once (the frame draws none). Returns false when there is no main region to move into.
export function routeChanged(label, site, doc = document) {
    doc.title = label && label !== site ? `${label} - ${site}` : site;
    const main = doc.getElementById('pk-main');
    if (!main) return false;
    let live = doc.getElementById('pk-route-live');
    if (!live) { live = doc.createElement('div'); live.id = 'pk-route-live'; live.className = 'u-sr-only'; live.style.setProperty('position', 'fixed', 'important'); live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite'); doc.body.append(live); }
    pageLoaded(main, live, label || site);
    return true;
}
