import { loadElements } from '../../js/loader.js';
import { showState } from '../../js/page-shell.js';
import { fillSanitizedHtml } from '../../js/sanitized-html.js';

// pk-doc-page (App framework tracker #346, step 7, issue #353): a side nav of items + an article + a table of contents + a pager, built from
// the guides page's own behaviour (core/site/guides/page.js) and generalised: nav-item building, in-page anchor scroll (a same-page link in the
// article scrolls the article, not the whole shell, and gets its own address via the pk-navigate event), focus on the title after a real
// navigation, and the first-load anchor settle (the elements below the article are still upgrading, so the scroll position is retried once).
//
// config (JSON): { items: [{ id, title, summary }], id: currentId|null, anchor: headingId|null, search: true, home: { title, summary }, level: 1 }.
// id === null shows the home list (every item, linked); id set loads and shows that item.
// Callback properties (business logic, never JSON - STANDARDS.md): loadItem(id) -> { title, summary, html } | Promise<...>; href(id, anchor?) ->
// string, used for nav items, the pager and the home list's links. (The element's own load(id) method drives loadItem; do not confuse the two.)
// Options (config): navLabel ('Contents'), pagerLabel ('Page navigation'), breadcrumb: true (a pk-breadcrumb above the title: the home title, then the item),
// home.cards: true (the home list as a grid of pk-cards), scroller (a selector: the host's own scrolling box, which the table of contents follows instead of the window). Host search (a callback property): searchItems(query) -> { ids, status? } replaces the nav's title filter with a search
// box that shows only the items whose id is in `ids` and says `status` in a polite line under it (the host decides what matches, for example the text of the documents).
// Event: pk-navigate { id, anchor, replace: false } - a same-page link inside the article was followed; the host rewrites the address
// (history.pushState/replaceState) and keeps `anchor` in the next config it sets. The element never touches history or the document itself.

let seq = 0;
const el = (doc, tag, attrs = {}, ...kids) => {
    const n = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
    n.append(...kids);
    return n;
};

export default Base => class extends Base {
    connected() {
        if (this.$w) return;
        this.$w = true;
        this.$bodyId = `pkdoc-body-${++seq}`;
        this.buildShell();
        loadElements(this);
        this.$first = true;
        this.$pending = this.paint();
    }
    disconnected() { clearTimeout(this.$settleTimer); }
    changed(name) { if (this.$w && name === 'config') this.$pending = this.paint(); }

    // Every light-DOM child this element shows is one it creates and owns itself (never a host-given node), slotted into its own shadow
    // template - like pk-states-page (core/pages/states-page/states-page.js): the SDK's on-demand loader watches only the document's light
    // DOM for pk-* tags (js/loader.js), so anything a page type needs findable from outside (pk-toc's `for`, which uses document.querySelector
    // and cannot see into any shadow root) has to live there too. See core/STANDARDS.md, "Ownership and reactivity" rule 3.
    buildShell() {
        const doc = this.ownerDocument;
        this.$nav = el(doc, 'pk-side-nav', { slot: 'nav', label: 'Contents' });
        this.$toggle = el(doc, 'pk-button', { slot: 'bar', class: 'doc-page-toggle', variant: 'ghost', toggle: true }, 'Menu');
        this.$toc = el(doc, 'pk-toc', { slot: 'aside', for: `#${this.$bodyId}`, levels: 'h2,h3', heading: 'On this page' });
        this.$title = el(doc, `h${[1, 2, 3].includes(this.config?.level) ? this.config.level : 1}`, { class: 'doc-page-title', tabindex: '-1' }); // config.level: read once, when the shell is built
        this.$summary = el(doc, 'p', { class: 'doc-page-summary' });
        this.$body = el(doc, 'div', { class: 'prose', id: this.$bodyId });
        this.$pager = el(doc, 'pk-pager', { label: 'Page navigation' });
        this.$crumbs = el(doc, 'pk-breadcrumb', { label: 'Breadcrumb', hidden: true });
        this.append(this.$nav, this.$toggle, this.$toc, this.$crumbs, this.$title, this.$summary, this.$body, this.$pager);
        this.$toggle.addEventListener('click', () => this.$nav.toggleAttribute('open', !this.$nav.hasAttribute('open')));
        this.$nav.addEventListener('pk-close', () => this.$toggle.removeAttribute('pressed'));
        this.$nav.addEventListener('click', e => { if (e.target.closest?.('pk-nav-item')) this.$nav.removeAttribute('open'); });
        // A same-page link inside the article (the toc, a heading's own permalink) scrolls the article, not the whole page shell, and reports
        // the new address through pk-navigate rather than touching history itself.
        this.$body.addEventListener('click', e => this.onBodyClick(e));
        this.$toc.addEventListener('click', e => this.onBodyClick(e)); // the table of contents is the article's own index: its links scroll the article too
    }

    linkFor(id, anchor) { return typeof this.href === 'function' ? this.href(id, anchor) : `#${id ?? ''}`; }

    paint() {
        const cfg = this.config ?? {};
        const items = Array.isArray(cfg.items) ? cfg.items : [];
        const id = cfg.id ?? null;
        this.buildNav(items, id);
        if (id === this.$currentId) { if (cfg.anchor) this.scrollToHeading(cfg.anchor); return; }
        return this.load(id, cfg);
    }

    buildNav(items, currentId) {
        const key = JSON.stringify(items.map(i => i?.id));
        if (key !== this.$navKey) {
            this.$navKey = key;
            for (const n of [...this.$nav.querySelectorAll('pk-nav-item')]) n.remove();
            const doc = this.ownerDocument;
            for (const it of items) {
                const item = el(doc, 'pk-nav-item', { href: this.linkFor(it.id) }, el(doc, 'pk-icon', { slot: 'icon', name: 'docs' }), it.title ?? it.id);
                item.dataset.docId = it.id;
                this.$nav.append(item);
            }
            loadElements(this.$nav);
        }
        this.$nav.setAttribute('label', this.config?.navLabel || 'Contents');
        this.$pager.setAttribute('label', this.config?.pagerLabel || 'Page navigation');
        if (this.config?.scroller) this.$toc.setAttribute('scroller', this.config.scroller);
        this.$nav.toggleAttribute('filterable', (this.config?.search ?? true) && items.length > 0 && typeof this.searchItems !== 'function');
        this.syncSearch();
        for (const n of this.$nav.querySelectorAll('pk-nav-item')) n.toggleAttribute('current', n.dataset.docId === currentId);
    }

    // The host's own search (searchItems): a search box at the top of the nav, built once; each input hides the items the host did not name and says its status line.
    syncSearch() {
        const on = typeof this.searchItems === 'function' && (this.config?.search ?? true);
        if (!on) { this.$search?.remove(); this.$search = null; return; }
        if (!this.$search) {
            const doc = this.ownerDocument;
            this.$input = el(doc, 'pk-input', { type: 'search' });
            this.$status = el(doc, 'pk-text', { size: 'meta', tone: 'muted', 'aria-live': 'polite' });
            this.$search = el(doc, 'pk-container', { padding: 'sm' }, el(doc, 'pk-stack', { gap: 'xs' }, this.$input, this.$status));
            this.$input.addEventListener('input', () => this.runSearch());
            this.$nav.prepend(this.$search);
            loadElements(this.$search);
        }
        const label = this.config?.searchLabel || 'Search';
        this.$input.setAttribute('placeholder', label); this.$input.setAttribute('aria-label', label);
    }
    runSearch() {
        const q = String(this.$input.value ?? '').trim(), items = [...this.$nav.querySelectorAll('pk-nav-item')];
        const r = q ? this.searchItems(q) : null, hit = new Set(r?.ids ?? []);
        for (const n of items) n.hidden = q !== '' && !hit.has(n.dataset.docId);
        this.$status.textContent = q ? r?.status ?? '' : '';
    }

    // The breadcrumb above the title (config.breadcrumb): the home title as a link, then the current page.
    paintCrumbs(title) {
        const on = !!this.config?.breadcrumb;
        this.$crumbs.hidden = !on;
        if (!on) return;
        const doc = this.ownerDocument, root = this.config?.home?.title ?? 'Documentation';
        this.$crumbs.replaceChildren(...(title ? [el(doc, 'a', { href: this.linkFor(null) }, root), el(doc, 'span', { 'aria-current': 'page' }, title)] : [el(doc, 'span', { 'aria-current': 'page' }, root)]));
        loadElements(this.$crumbs);
    }

    // Loads and paints `id` (null = the home list). Superseded loads (id changed again before this one resolves) are dropped silently.
    async load(id, cfg = this.config ?? {}) {
        this.$currentId = id;
        const wasFirst = this.$first;
        this.$first = false;
        const items = Array.isArray(cfg.items) ? cfg.items : [];
        if (id == null) { this.paintHome(items, cfg.home); this.settle(cfg.anchor, wasFirst); return; }
        // While the item is on its way (or if it fails) the page shows what config.items already says about it, never the previous item's title, pager
        // or table of contents next to a skeleton or an error.
        const known = items.find(i => i?.id === id);
        this.$title.textContent = known?.title ?? '';
        this.$summary.textContent = known?.summary ?? '';
        this.paintCrumbs(known?.title ?? id);
        this.paintPager(items, id);
        showState(this.$body, 'loading', { label: 'Loading' });
        this.syncToc();
        loadElements(this.$body);
        try {
            const item = typeof this.loadItem === 'function' ? await this.loadItem(id) : null;
            if (id !== this.$currentId) return; // a newer load has already taken over
            if (!item) { this.paintMissing(id); this.settle(cfg.anchor, wasFirst); return; }
            this.paintItem(item, items, id);
            this.settle(cfg.anchor, wasFirst);
            if (!wasFirst) requestAnimationFrame(() => this.$title.focus({ preventScroll: true }));
        } catch (err) {
            if (id !== this.$currentId) return;
            this.log?.error?.('pk-doc-page: loadItem failed', err);
            showState(this.$body, 'error', { error: err, retry: () => this.load(id, this.config ?? {}) });
            this.syncToc();
            loadElements(this.$body);
        }
    }

    // The toc lists the headings of the article it is bound to: read the new ones, and hide it while there are none (the home list, a not-found note).
    syncToc() {
        this.$toc.hidden = !this.$body.querySelector('h2,h3');
        this.$toc.refresh?.();
    }

    paintHome(items, home) {
        this.$title.textContent = home?.title ?? 'Documentation';
        this.$summary.textContent = home?.summary ?? '';
        this.paintCrumbs(null);
        const doc = this.ownerDocument;
        if (home?.cards) {
            this.$body.replaceChildren(el(doc, 'pk-grid', { min: '16rem' }, ...items.map(it => el(doc, 'pk-card', { heading: it.title ?? it.id, href: this.linkFor(it.id) }, it.summary ?? ''))));
            loadElements(this.$body);
        } else {
            const list = el(doc, 'ul', { part: 'home-list' });
            for (const it of items) list.append(el(doc, 'li', {}, el(doc, 'a', { href: this.linkFor(it.id) }, it.title ?? it.id)));
            this.$body.replaceChildren(list);
        }
        this.$pager.replaceChildren();
        this.syncToc();
    }
    paintMissing(id) {
        this.$title.textContent = 'Not found';
        this.$summary.textContent = '';
        this.paintCrumbs('Not found');
        showState(this.$body, 'empty', { heading: 'Not found', description: `There is nothing called "${id}" here.` });
        loadElements(this.$body);
        this.$pager.replaceChildren();
        this.syncToc();
    }
    paintItem(item, items, id) {
        this.$title.textContent = item.title ?? '';
        this.$summary.textContent = item.summary ?? '';
        this.paintCrumbs(item.title ?? id);
        fillSanitizedHtml(this.$body, item.html ?? '');
        this.paintPager(items, id);
        this.syncToc();
    }
    paintPager(items, id) {
        const at = items.findIndex(i => i?.id === id);
        const prev = at > 0 ? items[at - 1] : null, next = at >= 0 && at < items.length - 1 ? items[at + 1] : null;
        const doc = this.ownerDocument;
        this.$pager.replaceChildren(
            ...(prev ? [el(doc, 'a', { slot: 'prev', href: this.linkFor(prev.id), rel: 'prev' }, `← ${prev.title ?? prev.id}`)] : []),
            el(doc, 'span', {}, at >= 0 ? `${at + 1} of ${items.length}` : ''),
            ...(next ? [el(doc, 'a', { slot: 'next', href: this.linkFor(next.id), rel: 'next' }, `${next.title ?? next.id} →`)] : []));
    }

    // Scrolls the article's own body to a heading inside it (never scrollIntoView on a boundary the article does not own); the heading's own
    // `scroll-margin-top` (set by the host's stylesheet) leaves room for a sticky bar above it. Returns whether the heading was found.
    scrollToHeading(id) {
        const t = id && this.$body.querySelector(`[id="${CSS.escape(id)}"]`);
        if (!t) { if (id) this.warnOnce?.(`heading:${id}`, `pk-doc-page: no heading "${id}"`, { id }); return false; }
        const sc = this.config?.scroller && this.ownerDocument.querySelector(this.config.scroller);
        // With the host's own scroller only that box moves (scrollIntoView would also move every box around it, the page shell included).
        if (sc) sc.scrollTop += t.getBoundingClientRect().top - sc.getBoundingClientRect().top - (parseFloat(getComputedStyle(t).scrollMarginTop) || 0);
        else t.scrollIntoView({ block: 'start' });
        return true;
    }
    // The first time this item loads, the elements above and below the article are still upgrading and can still shift its position; retry
    // the scroll once, shortly after, the same way the guides page did.
    settle(anchor, wasFirst) {
        if (!anchor) return;
        this.scrollToHeading(anchor);
        if (wasFirst) { clearTimeout(this.$settleTimer); this.$settleTimer = setTimeout(() => this.scrollToHeading(anchor), 400); }
    }
    onBodyClick(e) {
        const a = e.composedPath().find(n => n.localName === 'a' && /^#[^/]/.test(n.getAttribute?.('href') ?? ''));
        if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
        let id; try { id = decodeURIComponent(a.getAttribute('href').slice(1)); } catch { return; }
        if (!this.scrollToHeading(id)) return;
        e.preventDefault();
        this.emit('pk-navigate', { id: this.$currentId, anchor: id, replace: false });
    }
};
