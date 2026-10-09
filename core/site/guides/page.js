// The Guides page: the site shell around one pk-doc-page (a side nav of guides with a search of the build's word index, the article made at build time from
// Markdown (see tools/guides.mjs), a table of contents, a breadcrumb and previous/next links). Routing is js/router.js in hash mode (mounted below): #/ is the
// list, #/<guide> a guide, #/<guide>/<heading> a place in it. A bare in-page anchor ('#<heading>', a typed address) is not a route and stays page-local
// (guides-logic.js, isAnchorHash); one the toc or a heading's permalink makes goes through pk-doc-page's pk-navigate.
import { mountShell } from '../shell.js';
import { createLogger } from '../../js/log.js';
import { mountRouter } from '../../js/router.js';
import { GUIDES } from './guides.data.js';
import { routeHash, isAnchorHash } from './guides-logic.js';
import { searchGuides } from './guides-search.js';
import { on } from '../../js/mount-support.js';

const log = createLogger('guides');
const ids = GUIDES.map(g => g.id);
const page = document.getElementById('guides'), scroller = document.getElementById('guides-scroll');

// The guide's HTML was made and sanitised by the build (tools/markdown.mjs); pk-doc-page puts it in through js/sanitized-html.js.
page.href = (id, anchor) => (id == null ? '#/' : routeHash(id, anchor));
page.loadItem = id => {
    const g = GUIDES.find(x => x.id === id);
    if (!g) { log.warn(`no guide named "${id}"`, { known: ids }); return null; }
    return { title: g.title, summary: g.summary, html: g.html };
};
// Full-text search of the nav: title search is instant (checked live against GUIDES), body search reads the word index the build made (guides-search.js,
// guides.data.js). The page hides the guides that do not match, and the status line says, for screen readers too, which did and how (its title, or only its text).
page.searchItems = query => {
    const results = searchGuides(GUIDES, query);
    const titled = results.filter(r => r.titleMatch).map(r => r.guide.title), mentioned = results.filter(r => !r.titleMatch && r.bodyMatch).map(r => r.guide.title);
    return {
        ids: results.map(r => r.guide.id),
        status: results.length
            ? [titled.length && `${titled.length} guide${titled.length === 1 ? '' : 's'} titled “${query.trim()}”: ${titled.join(', ')}`, mentioned.length && `mentioned in ${mentioned.join(', ')}`].filter(Boolean).join('; ')
            : `No guides match “${query.trim()}”.`,
    };
};
const base = {
    items: GUIDES.map(({ id, title, summary }) => ({ id, title, summary })), search: true, breadcrumb: true, scroller: '#guides-scroll',
    navLabel: 'Guides', pagerLabel: 'Guide navigation', searchLabel: 'Search guides',
    home: { title: 'Guides', summary: 'Getting started, theming and logging, written from what the repository does today.', cards: true },
};

// The route tree: '/' the list, '/:id' a guide, '/:id/:frag' a heading inside it. Whether ':id' names a real guide is pk-doc-page's business (its loadItem says no).
const routes = [{ path: '/', label: 'Guides' }, { path: '/:id', label: '' }, { path: '/:id/:frag', label: '' }];
let current = null;

// A bare in-page anchor ('#install', a typed address) is not a route: this scrolls the article to it and rewrites the address to one that reloads to the same
// place, and never reaches the router. It must run before the router's own hashchange listener (registered next).
window.addEventListener('hashchange', e => {
    if (!isAnchorHash(location.hash)) return;
    const decode = s => { try { return decodeURIComponent(s); } catch { return s; } }; // a malformed %-escape is kept as typed, and then matches nothing
    const id = decode(location.hash.slice(1));
    if (current) { page.config = { ...page.config, anchor: id }; history.replaceState(null, '', routeHash(current, id)); }
    e.stopImmediatePropagation();
});

const router = mountRouter(null, { routes, mode: 'hash' });

function route() {
    const rt = router.current(); // hash mode always matches (a default not-found route), so rt is never null here
    const guideId = (rt.path === '/:id' || rt.path === '/:id/:frag') ? rt.params.id : null;
    const frag = rt.path === '/:id/:frag' ? rt.params.frag : null;
    const changed = guideId !== current || !frag;
    current = guideId;
    page.config = { ...base, id: guideId, anchor: frag };
    const guide = guideId && GUIDES.find(g => g.id === guideId);
    document.title = !guideId ? 'Guides - Plainkit' : guide ? `${guide.title} - Guides - Plainkit` : 'Guide not found - Plainkit';
    if (changed) scroller.scrollTop = 0; // a new page starts at its top; the link to the guide you are already reading goes to its top
}

mountShell({ page: 'guides', title: null });
// A same-page link (the toc, a heading's permalink) scrolls the article and gets its own history entry: pk-doc-page scrolls and reports it, the address is the page's.
on(page, 'pk-navigate', e => history.pushState(null, '', routeHash(e.detail.id, e.detail.anchor)));
router.subscribe(route);
if (!isAnchorHash(location.hash)) route(); // a bare anchor on first load has no current guide to scroll within yet; the anchor listener above already no-ops on it
