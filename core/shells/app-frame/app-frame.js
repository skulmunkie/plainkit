import { loadElements } from '../../js/loader.js';
import { safeHref } from '../../js/safe-url.js';
import { mediaBelow } from '../../js/breakpoints.js';

// pk-app-frame: the app frame a Blazor PkApp (or any host) needs, driven by data: the nav rows, the current row and the branches to open, the module list,
// the breadcrumb trail and the search results come in as props; the page is the default slot, a footer the footer slot. The composition is the one
// js/app/shell.js builds for mountApp (header with brand, module picker, search and settings, side nav, breadcrumb above the page), done in this element's
// own shadow tree. It routes nothing: links are plain hrefs, the host navigates and sets the props again. Search is the host's (pk-query in, searchItems
// out); the theme item raises pk-theme-toggle and changes nothing itself. The skip link and the <main id="pk-main"> belong to the host (an id cannot be
// named across a shadow boundary): put them in the page slot.
const h = (tag, attrs = {}, text) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
    if (text != null) e.textContent = text;
    return e;
};

export default Base => class extends Base {
    connected() {
        // The footer strip is drawn only while there is something in it (the shell counts a slot), so the forwarding span is attached only with a footer child.
        this.$mo = new MutationObserver(() => this.footer());
        this.$mo.observe(this, { childList: true });
        // Narrow, the module picker leaves the bar (pk-navbar hides it) and is the drawer's first row, as js/app/app.js drawNav does for mountApp.
        this.$mq = mediaBelow('tablet');
        this.$mq.addEventListener('change', this.$mqf ??= () => this.paintNav());
        if (this.$w) return;
        this.$w = true;
        loadElements(this.shadowRoot); // every element in this tree is created by the template, not by the page
        // A menu's own select is not the app's: module links navigate by href, only the search result and the theme item mean something to the host.
        // A tap on a drawer link closes the drawer at once, as mountApp does on a route change (#1352); a branch row (no href) only expands.
        this.part('nav').addEventListener('click', e => { const nav = e.currentTarget; if (nav.open && e.target.closest?.('pk-nav-item[href]')) nav.hide(); });
        this.part('picker').addEventListener('pk-select', e => e.stopPropagation());
        this.part('settings').addEventListener('pk-select', e => { e.stopPropagation(); this.emit('pk-theme-toggle', {}, { cancelable: false }); });
    }
    disconnected() { this.$mo?.disconnect(); this.$mq?.removeEventListener('change', this.$mqf); }

    footer() {
        const has = !!this.querySelector(':scope > [slot="footer"]'), span = this.$f ??= this.part('footer');
        if (has) this.part('shell').append(span); else span.remove();
    }

    updated() {
        this.footer();
        const brand = this.part('brand'), href = safeHref(this.brandHref);
        brand.textContent = this.brand;
        if (href) brand.setAttribute('href', href); else brand.removeAttribute('href');
        const mods = Array.isArray(this.modules) ? this.modules : [], picker = this.part('picker');
        picker.hidden = mods.length < 2;
        this.part('module').textContent = this.moduleTitle || 'Modules';
        picker.replaceChildren(picker.firstElementChild, ...mods.map(m => h('pk-menu-item', { href: safeHref(m.href) || null, 'data-module': m.id }, m.title)));
        const search = this.part('search');
        search.hidden = !this.search;
        search.setAttribute('label', this.searchPlaceholder); search.setAttribute('placeholder', this.searchPlaceholder);
        search.items = Array.isArray(this.searchItems) ? this.searchItems : [];
        const crumbs = Array.isArray(this.crumbs) ? this.crumbs : [], trail = this.part('crumbs'), last = crumbs.length - 1;
        trail.hidden = crumbs.length === 0;
        trail.replaceChildren(...crumbs.map((c, i) => h('a', { href: i < last ? safeHref(c.href) || null : null, 'aria-current': i === last ? 'page' : null }, c.label)));
        this.paintNav();
    }

    // Rebuilt from the data on every update (a nav is small and structural); the current row and the open branches follow `currentId` and `trail`.
    paintNav() {
        const nav = this.part('nav'), rows = Array.isArray(this.nav) ? this.nav : [], open = Array.isArray(this.trail) ? this.trail : [];
        const build = (it, slot) => {
            const row = h('pk-nav-item', { slot, 'data-module': it.module || null, href: safeHref(it.href) || null, current: it.current ?? it.id === this.currentId, expanded: it.id !== this.current && open.includes(it.id) });
            if (it.icon) row.append(h('pk-icon', { slot: 'icon', name: it.icon }));
            row.append(document.createTextNode(it.title ?? ''));
            if (it.badge != null) row.append(h('span', { slot: 'badge' }, String(it.badge)));
            for (const k of Array.isArray(it.children) ? it.children : []) row.append(build(k, 'children'));
            return row;
        };
        const mods = Array.isArray(this.modules) ? this.modules : [];
        const pick = mods.length > 1 && this.$mq?.matches ? [{ id: 'module:picker', title: this.moduleTitle || 'Modules', children: mods.map(m => ({ id: `module:${m.id}`, module: m.id, title: m.title, href: m.href, current: m.title === this.moduleTitle })) }] : [];
        nav.replaceChildren(...[...pick, ...rows].map(it => build(it)));
        nav.hidden = rows.length + pick.length === 0;
    }
};
