import { filterNav, treeKey, serializeNav, parseNav, resolveActiveRoute } from '../../js/nav-logic.js';
import { mediaBelow } from '../../js/breakpoints.js';
export { filterNav, splitMatch, treeKey, serializeNav, parseNav, railFlyoutPlacement, railRowTooltip, DRAWER_BREAKPOINT, navMode, resolveActiveRoute } from '../../js/nav-logic.js';

// pk-side-nav: icon rail, filter, arrow-key tree navigation, persisted state, and an off-canvas drawer on small screens.
const items = nav => [...nav.querySelectorAll('pk-nav-item')];
// Rows the user can reach: group titles (pk-nav-item group) are static text, so they never take focus and the filter leaves them out.
export const rowsOf = nav => items(nav).filter(i => !i.group);
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
            this.$mq = mediaBelow('tablet'); this.$sync = () => this.sync();
            this.restore(); customElements.whenDefined('pk-nav-item').then(() => { this.sync(); this.route(); });
        }
        this.$mq.addEventListener('change', this.$sync);
        this.sync(); this.route();
    }
    changed(name) {
        if (name === 'collapsed') { this.sync(); this.save(); }
        else if (name === 'open' && this.isConnected) this.drawer();
        else if (name === 'currentPath' || name === 'autoExpandActive') this.route();
    }
    // Opt-in active-route resolution: the host sets current-path (e.g. from its router) and auto-expand-active; the nav resolves which
    // pk-nav-item is the active leaf (see resolveActiveRoute in nav-logic.js) and sets `current` on it, clearing every other row. With
    // auto-expand-active it also opens every ancestor branch of that leaf and collapses every other branch. The host still owns the
    // pk-nav-item markup (light DOM); this only ever writes to props of the host's own existing nodes, never invents structure.
    route() {
        if (!this.currentPath) return;
        const rows = items(this);
        const entries = rows.map(i => ({ id: idOf(i), href: i.href || '', parent: i.parentElement?.closest?.('pk-nav-item') ? idOf(i.parentElement) : null }));
        const { current, open } = resolveActiveRoute(entries, this.currentPath);
        rows.forEach((i, k) => { if (i.href) i.current = entries[k].id === current; });
        if (this.autoExpandActive) for (const i of rows) if (i.querySelector('pk-nav-item')) i.expanded = open.has(idOf(i));
    }
    request(reason) { if (this.emit('pk-close', { reason })) this.open = false; }
    show() { this.open = true; }
    hide() { this.request('method'); }
    toggleCollapsed() { this.collapsed = !this.collapsed; this.emit('pk-nav-toggle', { collapsed: this.collapsed }); }
    sync() {
        const rail = this.collapsed && !this.$mq.matches;
        // Only the top-level rows are in the rail: a child inside an open flyout keeps its label (issue 299).
        for (const i of items(this)) i.rail = rail && !i.parentElement?.closest?.('pk-nav-item');
        this.part('collapse').setAttribute('aria-expanded', String(!this.collapsed));
        this.part('collapse').setAttribute('aria-label', this.collapsed ? 'Expand the menu' : 'Collapse the menu');
    }
    drawer() {
        if (this.open) { this.$from = document.activeElement; rowsOf(this).find(i => !i.hidden && !i.disabled)?.focusRow(); this.emit('pk-open', {}); }
        else { this.$from?.focus?.({ preventScroll: true }); this.$from = null; }
    }
    disconnected() { this.$from = null; this.$mq?.removeEventListener('change', this.$sync); }
    save() {
        if (!this.persist) return;
        try { localStorage.setItem(this.persist, serializeNav(items(this).filter(i => i.expanded).map(idOf), this.collapsed)); } catch (error) { this.log.debug('storage blocked: the expanded state is not saved', error); }
    }
    restore() {
        if (!this.persist) return;
        const text = (() => { try { return localStorage.getItem(this.persist); } catch (error) { this.log.debug('storage blocked: the saved expanded state is not restored', error); return undefined; } })();
        if (text === undefined) return;
        const s = parseNav(text);
        if (text) { const was = this.collapsed; this.collapsed = s.collapsed; if (this.collapsed !== was) this.emit('pk-nav-toggle', { collapsed: this.collapsed }, { cancelable: false }); }
        const open = new Set(s.open);
        if (text) for (const i of items(this)) if (i.querySelector('pk-nav-item')) i.expanded = open.has(idOf(i));
    }
    filter(q) {
        const all = rowsOf(this); for (const g of items(this).filter(i => i.group)) g.hidden = Boolean(q.trim());
        const entries = all.map(i => ({ id: idOf(i), label: labelOf(i), parent: i.parentElement?.closest?.('pk-nav-item') ? idOf(i.parentElement) : null }));
        if (!this.$saved && q.trim()) this.$saved = new Map(all.map(i => [i, i.expanded]));
        const r = filterNav(entries, q);
        all.forEach((i, k) => { i.hidden = !r.visible.has(entries[k].id); if (q.trim() && r.open.has(entries[k].id)) i.expanded = true; });
        if (!q.trim() && this.$saved) { for (const [i, v] of this.$saved) i.expanded = v; this.$saved = null; }
        this.part('scroll').setAttribute('aria-label', q.trim() ? `${r.matches.size} matches` : '');
    }
    rows() {
        return rowsOf(this).filter(i => !i.hidden && !i.disabled && (() => { for (let p = i.parentElement?.closest?.('pk-nav-item'); p; p = p.parentElement?.closest?.('pk-nav-item')) if (!(p.expanded || p.flyout)) return false; return true; })());
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
