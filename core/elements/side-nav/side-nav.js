import { filterNav, treeKey, serializeNav, parseNav } from '../../js/nav-logic.js';
export { filterNav, splitMatch, treeKey, serializeNav, parseNav, railFlyoutPlacement, railRowTooltip, DRAWER_BREAKPOINT, navMode } from '../../js/nav-logic.js';

// pk-side-nav: icon rail, filter, arrow-key tree navigation, persisted state, and an off-canvas drawer on small screens.
const items = nav => [...nav.querySelectorAll('pk-nav-item')];
const labelOf = i => [...i.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim() || i.textContent.trim();
const idOf = i => `${i.parentElement?.closest?.('pk-nav-item') ? labelOf(i.parentElement) + '/' : ''}${labelOf(i)}`;

export default Base => class extends Base {
    connected() {
        if (!this.$w) {
            this.$w = true; this.$saved = null;
            this.part('collapse').addEventListener('click', () => this.toggleCollapsed());
            this.part('backdrop').addEventListener('click', () => this.request('backdrop'));
            this.part('filter-input')?.addEventListener('input', e => this.filter(e.target.value));
            this.addEventListener('keydown', e => this.key(e));
            this.addEventListener('pk-toggle', () => this.save());
            this.addEventListener('keydown', e => { if (e.key === 'Escape' && this.open) this.request('escape'); });
            this.watchSlot('', () => this.sync());
            this.$mq = globalThis.matchMedia('(max-width: 1024px)'); this.$mq.addEventListener('change', () => this.sync());
            this.restore(); customElements.whenDefined('pk-nav-item').then(() => this.sync());
        }
        this.sync();
    }
    changed(name) { if (name === 'collapsed') { this.sync(); this.save(); } else if (name === 'open' && this.isConnected) this.drawer(); }
    request(reason) { if (this.emit('pk-close', { reason })) this.open = false; }
    show() { this.open = true; }
    hide() { this.request('method'); }
    toggleCollapsed() { this.collapsed = !this.collapsed; this.emit('pk-nav-toggle', { collapsed: this.collapsed }); }
    sync() {
        const rail = this.collapsed && !this.$mq.matches;
        for (const i of items(this)) i.rail = rail;
        this.part('collapse').setAttribute('aria-expanded', String(!this.collapsed));
        this.part('collapse').setAttribute('aria-label', this.collapsed ? 'Expand the menu' : 'Collapse the menu');
    }
    drawer() {
        if (this.open) { this.$from = document.activeElement; items(this).find(i => !i.hidden && !i.disabled)?.focusRow(); this.emit('pk-open', {}); }
        else { this.$from?.focus?.({ preventScroll: true }); this.$from = null; }
    }
    disconnected() { this.$from = null; }
    save() {
        if (!this.persist) return;
        try { localStorage.setItem(this.persist, serializeNav(items(this).filter(i => i.expanded).map(idOf), this.collapsed)); } catch (error) { this.log.debug('storage blocked: the expanded state is not saved', error); }
    }
    restore() {
        if (!this.persist) return;
        const text = (() => { try { return localStorage.getItem(this.persist); } catch (error) { this.log.debug('storage blocked: the saved expanded state is not restored', error); return undefined; } })();
        if (text === undefined) return;
        const s = parseNav(text);
        if (text) this.collapsed = s.collapsed;
        const open = new Set(s.open);
        if (text) for (const i of items(this)) if (i.querySelector('pk-nav-item')) i.expanded = open.has(idOf(i));
    }
    filter(q) {
        const all = items(this); const entries = all.map(i => ({ id: idOf(i), label: labelOf(i), parent: i.parentElement?.closest?.('pk-nav-item') ? idOf(i.parentElement) : null }));
        if (!this.$saved && q.trim()) this.$saved = new Map(all.map(i => [i, i.expanded]));
        const r = filterNav(entries, q);
        all.forEach((i, k) => { i.hidden = !r.visible.has(entries[k].id); if (q.trim() && r.open.has(entries[k].id)) i.expanded = true; });
        if (!q.trim() && this.$saved) { for (const [i, v] of this.$saved) i.expanded = v; this.$saved = null; }
        this.part('scroll').setAttribute('aria-label', q.trim() ? `${r.matches.size} matches` : '');
    }
    rows() {
        return items(this).filter(i => !i.hidden && !i.disabled && (() => { for (let p = i.parentElement?.closest?.('pk-nav-item'); p; p = p.parentElement?.closest?.('pk-nav-item')) if (!p.expanded) return false; return true; })());
    }
    key(e) {
        const row = e.target.closest?.('pk-nav-item'); if (!row || e.target.closest('input')) return;
        const list = this.rows(); const at = list.indexOf(row);
        const parent = row.parentElement?.closest?.('pk-nav-item');
        const act = treeKey(e.key, { expanded: row.expanded || row.flyout, hasChildren: row.hasChildren, isChild: Boolean(parent) });
        if (!act) return;
        e.preventDefault(); e.stopPropagation();
        const go = i => list[i]?.focusRow();
        if (act === 'next') go(Math.min(at + 1, list.length - 1)); else if (act === 'prev') go(Math.max(at - 1, 0));
        else if (act === 'first') go(0); else if (act === 'last') go(list.length - 1);
        else if (act === 'expand') { if (row.rail) row.flyout = true; else { row.expanded = true; row.emit('pk-toggle', { expanded: true }); } }
        else if (act === 'collapse') { if (row.rail) row.flyout = false; else { row.expanded = false; row.emit('pk-toggle', { expanded: false }); } }
        else if (act === 'focus-child') go(at + 1);
        else if (act === 'focus-parent') parent.focusRow();
    }
};
