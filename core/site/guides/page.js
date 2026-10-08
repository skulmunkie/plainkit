// The Guides page: the site shell around a side nav of guides, the article (built at build time from Markdown, see tools/guides.mjs), a table of contents,
// a breadcrumb and previous/next links. Routing is js/router.js in hash mode (mounted below): #/ is the list, #/<guide> a guide, #/<guide>/<heading> a
// place in it. A bare in-page anchor ('#<heading>', the toc or a heading's permalink) is not a route and stays page-local (guides-logic.js, isAnchorHash).
import { mountShell } from '../shell.js';
import { createLogger } from '../../js/log.js';
import { fillSanitizedHtml } from '../../js/sanitized-html.js';
import { mountRouter } from '../../js/router.js';
import { GUIDES } from './guides.data.js';
import { neighbours, routeHash, isAnchorHash } from './guides-logic.js';
import { searchGuides } from './guides-search.js';
import { on } from '../../js/mount-support.js';

const log = createLogger('guides');
const $ = id => document.getElementById(id);
const ids = GUIDES.map(g => g.id);
const nav = $('gd-nav'), body = $('gd-body'), scroller = $('gd-scroll'), contents = $('gd-contents');
const searchInput = $('gd-search'), searchStatus = $('gd-search-status');

function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
    n.append(...kids);
    return n;
}

// The guide's HTML was made and sanitised by the build (tools/markdown.mjs: raw HTML never passes, addresses are checked, every value escaped).
// The actual sink (parse inert in a <template>, then import) lives in js/sanitized-html.js, shared with pk-doc-page's own article body (App
// framework tracker #346, step 7, issue #353) so there is exactly one place this pattern is implemented.
const fill = html => fillSanitizedHtml(body, html);

function buildNav() {
    nav.append(...GUIDES.map(g => el('pk-nav-item', { href: routeHash(g.id), 'data-guide': g.id }, el('pk-icon', { slot: 'icon', name: 'docs' }), g.title)));
}

const paintNav = current => { for (const n of nav.querySelectorAll('pk-nav-item')) n.toggleAttribute('current', n.dataset.guide === current); };
const closeNav = () => { nav.removeAttribute('open'); contents.removeAttribute('pressed'); };

// Full-text search of the nav: title search is instant (checked live against GUIDES), body search reads the word index the build made (guides-search.js,
// guides.data.js). Every guide item stays in the DOM; a search just hides the ones that do not match and says, for screen readers too, which did and how
// (its title, or only its text). Clearing the box shows every guide again.
function applySearch(query) {
    const q = query.trim();
    const items = [...nav.querySelectorAll('pk-nav-item[data-guide]')];
    if (!q) {
        for (const item of items) { item.hidden = false; item.removeAttribute('data-match'); }
        searchStatus.textContent = '';
        return;
    }
    const results = searchGuides(GUIDES, q);
    const byId = new Map(results.map(r => [r.guide.id, r]));
    for (const item of items) {
        const r = byId.get(item.dataset.guide);
        item.hidden = !r;
        if (r) item.setAttribute('data-match', r.titleMatch ? 'title' : 'body'); else item.removeAttribute('data-match');
    }
    const titled = results.filter(r => r.titleMatch).map(r => r.guide.title);
    const mentioned = results.filter(r => !r.titleMatch && r.bodyMatch).map(r => r.guide.title);
    searchStatus.textContent = results.length
        ? [titled.length && `${titled.length} guide${titled.length === 1 ? '' : 's'} titled “${q}”: ${titled.join(', ')}`, mentioned.length && `mentioned in ${mentioned.join(', ')}`].filter(Boolean).join('; ')
        : `No guides match “${q}”.`;
}

function paintCrumbs(title) {
    $('gd-crumbs').replaceChildren(...(title ? [el('a', { href: '#/' }, 'Guides'), el('span', { 'aria-current': 'page' }, title)] : [el('span', { 'aria-current': 'page' }, 'Guides')]));
}

function paintPager(guide) {
    const { prev, next, index } = neighbours(GUIDES, guide.id);
    $('gd-pager').replaceChildren(
        ...(prev ? [el('a', { slot: 'prev', href: routeHash(prev.id), rel: 'prev' }, `← ${prev.title}`)] : []),
        el('span', {}, `${index + 1} of ${GUIDES.length}`),
        ...(next ? [el('a', { slot: 'next', href: routeHash(next.id), rel: 'next' }, `${next.title} →`)] : []));
}

function paintHome() {
    $('gd-title').textContent = 'Guides';
    $('gd-summary').textContent = 'Getting started, theming and logging, written from what the repository does today.';
    body.replaceChildren(el('div', { class: 'gd-cards' }, ...GUIDES.map(g => el('pk-card', { heading: g.title, href: routeHash(g.id) }, g.summary))));
    $('gd-pager').replaceChildren();
    $('gd-aside').hidden = true;
    paintCrumbs(null);
    paintNav(null);
    document.title = 'Guides - Plainkit';
}

function paintMissing(id) {
    log.warn(`no guide named "${id}"`, { known: ids });
    $('gd-title').textContent = 'Guide not found';
    $('gd-summary').textContent = '';
    body.replaceChildren(el('pk-alert', { kind: 'warning' }, `There is no guide called “${id}”. `, el('a', { href: '#/' }, 'See all guides'), '.'));
    $('gd-pager').replaceChildren();
    $('gd-aside').hidden = true;
    paintCrumbs('Not found');
    paintNav(null);
    document.title = 'Guide not found - Plainkit';
}

function paintGuide(guide) {
    $('gd-title').textContent = guide.title;
    $('gd-summary').textContent = guide.summary;
    fill(guide.html);
    paintPager(guide);
    paintCrumbs(guide.title);
    paintNav(guide.id);
    $('gd-aside').hidden = guide.headings.filter(h => h.level <= 3).length === 0;
    $('gd-toc').refresh?.(); // the toc lists the headings of the article it is bound to: read the new ones
    document.title = `${guide.title} - Guides - Plainkit`;
}

// Scrolls the article's own scroller (scrollIntoView would also move the page shell around it), leaving the space the heading's scroll-margin-top asks for.
function scrollToHeading(id) {
    const t = id && body.querySelector(`[id="${CSS.escape(id)}"]`);
    if (!t) { if (id) log.warn(`no heading "${id}" in this guide`, { id }); return false; }
    scroller.scrollTop += t.getBoundingClientRect().top - scroller.getBoundingClientRect().top - (parseFloat(getComputedStyle(t).scrollMarginTop) || 0);
    return true;
}

// The route tree: '/' the list, '/:id' a guide, '/:id/:frag' a heading inside it. Whether ':id' names a real guide is checked against
// GUIDES below (the tree itself only knows shapes, not which ids exist); page.js builds its own breadcrumbs and title, so the labels
// here are unused and left minimal.
const routes = [{ path: '/', label: 'Guides' }, { path: '/:id', label: '' }, { path: '/:id/:frag', label: '' }];

let current, first = true;

// A bare in-page anchor ('#install', the toc or a heading permalink) is not a route: the browser has already scrolled to it, so this
// only rewrites the address to one that reloads to the same place, and never reaches the router. It must run before the router's own
// hashchange listener (registered next), and stops that listener from also treating the address as a route change.
window.addEventListener('hashchange', e => {
    if (!isAnchorHash(location.hash)) return;
    const decode = s => { try { return decodeURIComponent(s); } catch { return s; } }; // a malformed %-escape is kept as typed, and then matches nothing
    const id = decode(location.hash.slice(1));
    if (current && scrollToHeading(id)) history.replaceState(null, '', routeHash(current, id));
    e.stopImmediatePropagation();
});

const router = mountRouter(null, { routes, mode: 'hash' });

function route() {
    const rt = router.current(); // hash mode always matches (a default not-found route), so rt is never null here
    const guideId = (rt.path === '/:id' || rt.path === '/:id/:frag') ? rt.params.id : null;
    const frag = rt.path === '/:id/:frag' ? rt.params.frag : null;
    const kind = rt.path === '/' ? 'home' : guideId != null && ids.includes(guideId) ? 'guide' : 'missing';
    const id = kind === 'guide' ? guideId : null;

    const changed = first || kind !== 'guide' || id !== current || !body.firstElementChild;
    if (changed) {
        if (kind === 'guide') paintGuide(GUIDES.find(g => g.id === id)); else if (kind === 'missing') paintMissing(guideId ?? ''); else paintHome();
        current = id;
        scroller.scrollTop = 0;
    }
    if (kind === 'guide' && frag) { scrollToHeading(frag); if (first) setTimeout(() => scrollToHeading(frag), 400); } // on a first load the elements above it are still upgrading and change its position
    else if (!changed) scroller.scrollTop = 0; // the link to the guide you are already reading goes to its top
    closeNav();
    if (!first && changed) requestAnimationFrame(() => $('gd-title').focus({ preventScroll: true })); // a new page: keyboard and screen reader users start at its title
    first = false;
}

mountShell({ page: 'guides', title: null });
buildNav();
// pk-input's own 'input' event (native, bubbling and composed) reaches the nav as soon as the box changes, typed or cleared (Escape); no debounce needed
// for this few guides.
on(searchInput, 'input', () => applySearch(searchInput.value));
// On the bar, not on the button: the toggle button flips its own `pressed` first, and this sets it to what the drawer really is afterwards.
on(contents.parentElement, 'click', e => { if (!e.target.closest('#gd-contents')) return; const on = !nav.hasAttribute('open'); nav.toggleAttribute('open', on); contents.toggleAttribute('pressed', on); });
on(nav, 'pk-close', () => contents.removeAttribute('pressed')); // Escape or a tap on the backdrop closed the drawer
// A same-page link (the toc, a heading's permalink) scrolls the article's own scroller and gets its own history entry. The browser's default would also scroll the page
// shell around the article (the top bar would slide away), so it is done here; a hash typed by hand still comes through hashchange above.
on($('gd-scroll'), 'click', e => {
    const a = e.composedPath().find(n => n.localName === 'a' && /^#[^/]/.test(n.getAttribute('href') ?? ''));
    if (!a || !current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const id = decodeURIComponent(a.getAttribute('href').slice(1));
    if (!scrollToHeading(id)) return;
    e.preventDefault();
    history.pushState(null, '', routeHash(current, id));
});
router.subscribe(route);
if (!isAnchorHash(location.hash)) route(); // a bare anchor on first load has no current guide to scroll within yet; the anchor listener above already no-ops on it
