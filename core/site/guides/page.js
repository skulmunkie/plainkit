// The Guides page: the site shell around a side nav of guides, the article (built at build time from Markdown, see tools/guides.mjs), a table of contents,
// a breadcrumb and previous/next links. Hash routing (guides-logic.js): #/ is the list, #/<guide> a guide, #/<guide>/<heading> a place in it.
import { mountShell } from '../shell.js';
import { createLogger } from '../../js/log.js';
import { GUIDES } from './guides.data.js';
import { parseHash, neighbours, routeHash } from './guides-logic.js';

const log = createLogger('guides');
const $ = id => document.getElementById(id);
const ids = GUIDES.map(g => g.id);
const nav = $('gd-nav'), body = $('gd-body'), scroller = $('gd-scroll'), contents = $('gd-contents');

function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
    n.append(...kids);
    return n;
}

// The guide's HTML was made and sanitised by the build (tools/markdown.mjs: raw HTML never passes, addresses are checked, every value escaped); this is the page's one
// markup sink, parsed inert in a template and then imported.
function fill(html) {
    const t = document.createElement('template');
    t.innerHTML = html;
    body.replaceChildren(document.importNode(t.content, true));
}

function buildNav() {
    nav.append(...GUIDES.map(g => el('pk-nav-item', { href: routeHash(g.id), 'data-guide': g.id }, el('pk-icon', { slot: 'icon', name: 'docs' }), g.title)));
}

const paintNav = current => { for (const n of nav.querySelectorAll('pk-nav-item')) n.toggleAttribute('current', n.dataset.guide === current); };
const closeNav = () => { nav.removeAttribute('open'); contents.removeAttribute('pressed'); };

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

let current, first = true;
function route() {
    const r = parseHash(location.hash, ids);
    if (r.kind === 'anchor') {
        // An in-page link (the toc, a heading permalink): the browser has scrolled to it; make the address one that reloads to the same place.
        if (current && scrollToHeading(r.id)) history.replaceState(null, '', routeHash(current, r.id));
        return;
    }
    const id = r.kind === 'guide' ? r.id : null;
    const changed = first || r.kind !== 'guide' || id !== current || !body.firstElementChild;
    if (changed) {
        if (r.kind === 'guide') paintGuide(GUIDES.find(g => g.id === id)); else if (r.kind === 'missing') paintMissing(r.id); else paintHome();
        current = id;
        scroller.scrollTop = 0;
    }
    if (r.kind === 'guide' && r.frag) { scrollToHeading(r.frag); if (first) setTimeout(() => scrollToHeading(r.frag), 400); } // on a first load the elements above it are still upgrading and change its position
    else if (!changed) scroller.scrollTop = 0; // the link to the guide you are already reading goes to its top
    closeNav();
    if (!first && changed) requestAnimationFrame(() => $('gd-title').focus({ preventScroll: true })); // a new page: keyboard and screen reader users start at its title
    first = false;
}

mountShell({ page: 'guides', title: null });
buildNav();
contents.addEventListener('click', () => { const on = !nav.hasAttribute('open'); nav.toggleAttribute('open', on); contents.toggleAttribute('pressed', on); });
nav.addEventListener('pk-close', () => contents.removeAttribute('pressed')); // Escape or a tap on the backdrop closed the drawer
// A same-page link (the toc, a heading's permalink) scrolls the article's own scroller and gets its own history entry. The browser's default would also scroll the page
// shell around the article (the top bar would slide away), so it is done here; a hash typed by hand still comes through hashchange above.
$('gd-scroll').addEventListener('click', e => {
    const a = e.composedPath().find(n => n.localName === 'a' && /^#[^/]/.test(n.getAttribute('href') ?? ''));
    if (!a || !current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const id = decodeURIComponent(a.getAttribute('href').slice(1));
    if (!scrollToHeading(id)) return;
    e.preventDefault();
    history.pushState(null, '', routeHash(current, id));
});
window.addEventListener('hashchange', route);
route();
