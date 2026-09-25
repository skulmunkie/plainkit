// pk-app-bar-search: a search field for a shell's header row. Wide: a pill in the header, results in a floating panel below it (the same
// positioning as pk-combobox's popup). Phone (--phone): the pill collapses to an icon button; tapping it covers the header row with a
// full-width field and a close button, the pattern the SDK site's own header search (core/site/shell.js) uses.
//
// items is a JSON attribute or property (like pk-table's rows/columns), data-driven: { id, label, group?, sub?, thumbnail?, badge? }[].
// The host computes results (locally or on the server) in response to the debounced pk-query event; this element never filters or fetches
// itself. Choosing a result raises pk-select with the item; the host decides what happens (navigate, open a record) — never this element.
import { drawIcon } from '../../js/icon-sprite.js';
import { nextIndex } from '../../js/menu-logic.js';

const el = (tag, part, text) => { const e = document.createElement(tag); if (part) e.setAttribute('part', part); if (text) e.textContent = text; return e; };

export default Base => class extends Base {
    constructor() { super(); this.$rows = []; this.$a = -1; }

    connected() {
        if (this.$w) return;
        this.$w = true;
        const box = this.part('box'), input = this.part('control'), pop = this.part('popup');
        this.part('expand').addEventListener('click', () => this.expand());
        this.part('collapse').addEventListener('click', () => this.collapse());
        input.addEventListener('input', () => {
            clearTimeout(this.$t);
            this.$t = setTimeout(() => this.emit('pk-query', { query: input.value }, { cancelable: false }), this.debounce);
            this.setOpen(input.value !== '');
        });
        pop.addEventListener('slotchange', () => this.part('footer').hidden = !this.slotted('footer').length);
        pop.addEventListener('mousedown', e => e.preventDefault());
        pop.addEventListener('click', e => { const o = e.target.closest('.op'); if (o) this.select(this.$rows[Number(o.dataset.i)]); });
        this.addEventListener('keydown', e => this.keys(e));
        this.addEventListener('focusout', e => { if (!this.contains(e.relatedTarget)) this.setOpen(false); });
        box.addEventListener('focusout', e => { if (!this.expanded && !box.contains(e.relatedTarget)) this.collapse(); });
        // The shell drawer opening dismisses results and collapses this field, so two overlays never show at once: rule 5, a subscription
        // outside this element's own subtree, added here and removed in disconnected().
        this.$shell = this.closest('pk-app-shell');
        this.$onNav = e => { if (e.detail?.open) { this.setOpen(false); this.collapse(); } };
        this.$shell?.addEventListener('pk-nav-toggle', this.$onNav);
        this.$onRoute = () => { this.setOpen(false); this.collapse(); };
        addEventListener('popstate', this.$onRoute);
        drawIcon(this.part('expand-icon').firstChild, 'search', (k, m, d) => this.warnOnce(k, m, d));
        drawIcon(this.part('box-icon').firstChild, 'search', (k, m, d) => this.warnOnce(k, m, d));
        drawIcon(this.part('collapse-icon').firstChild, 'x', (k, m, d) => this.warnOnce(k, m, d));
        this.paint();
    }
    disconnected() {
        this.$shell?.removeEventListener('pk-nav-toggle', this.$onNav);
        removeEventListener('popstate', this.$onRoute);
        clearTimeout(this.$t);
    }
    changed(name) {
        if (name === 'items') this.paint();
        // A host-driven collapse (Blazor setting Expanded=false on navigation, since NavigationManager sees pushState routes popstate never
        // fires for): the same cleanup as collapse(), without re-emitting pk-toggle for a change the host made itself.
        else if (name === 'expanded' && !this.expanded) { this.setOpen(false); this.part('control').value = ''; }
    }

    expand() { if (this.expanded) return; this.emit('pk-toggle', { expanded: this.expanded = true }, { cancelable: false }); requestAnimationFrame(() => this.part('control').focus()); }
    collapse() { this.setOpen(false); this.part('control').value = ''; if (!this.expanded) return; this.emit('pk-toggle', { expanded: this.expanded = false }, { cancelable: false }); }
    setOpen(open) { if (this.$open === open) return; this.$open = open; this.part('popup').hidden = !open; this.part('control').setAttribute('aria-expanded', String(open)); this.highlight(-1); }

    paint() {
        const foot = this.part('footer');
        const items = Array.isArray(this.items) ? this.items : [];
        const pop = this.part('popup'), tpl = this.shadowRoot.querySelector('template');
        for (const o of pop.querySelectorAll('.op, .group, .note')) o.remove();
        this.$rows = [];
        let group = null;
        for (const item of items) {
            if (item.group && item.group !== group) { group = item.group; const g = el('div', 'group', group); g.setAttribute('role', 'presentation'); foot.before(g); }
            if (item.id == null || item.id === '') { const n = el('div', 'note', item.label ?? ''); n.setAttribute('role', 'presentation'); foot.before(n); continue; }
            const i = this.$rows.push(item) - 1;
            const row = tpl.content.firstElementChild.cloneNode(true);
            row.id = `pk-abs-${i}`; row.dataset.i = String(i);
            row.querySelector('[part="row-label"]').textContent = item.label ?? '';
            const sub = row.querySelector('[part="row-sub"]'); if (item.sub) { sub.textContent = item.sub; sub.hidden = false; }
            const th = row.querySelector('[part="thumb"]'); if (item.thumbnail) { th.style.backgroundImage = `url("${item.thumbnail}")`; th.hidden = false; }
            const bd = row.querySelector('[part="badge"]'); if (item.badge) { bd.textContent = item.badge; bd.hidden = false; }
            foot.before(row);
        }
        foot.hidden = !this.slotted('footer').length;
        this.part('empty').hidden = this.$rows.length > 0;
        if (this.$open) { const b = this.part('box').getBoundingClientRect(); const h = pop.getBoundingClientRect().height; pop.dataset.placement = innerHeight - b.bottom < h && b.top > innerHeight - b.bottom ? 'top' : 'bottom'; }
    }
    highlight(i) {
        this.$a = i;
        const cur = this.part('popup').querySelector(`#pk-abs-${i}`);
        for (const o of this.part('popup').querySelectorAll('.op')) o.classList.toggle('hl', o === cur);
        if (cur) { this.part('control').setAttribute('aria-activedescendant', cur.id); cur.scrollIntoView({ block: 'nearest' }); } else this.part('control').removeAttribute('aria-activedescendant');
    }
    select(item) {
        if (!item) return;
        this.emit('pk-select', { item });
        this.setOpen(false);
    }
    keys(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (this.$open) this.setOpen(false); else this.collapse(); return; }
        if (!this.$open) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') { e.preventDefault(); this.highlight(nextIndex(this.$a, this.$rows.length, e.key)); }
        else if (e.key === 'Enter' && this.$a >= 0) { e.preventDefault(); this.select(this.$rows[this.$a]); }
    }
};
