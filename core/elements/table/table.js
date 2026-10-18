// <pk-table> behaviour. The sorting and filtering it applies to the rows is in js/table-data.js (the same exports are kept here,
// re-exported through js/table-vw.js so table.js needs only one import for both).

import V, { sortKey, sortRows, filterRows, nextSort } from '../../js/table-vw.js';
import { rowId, rowIds, rowAt, idSet, toggleId, setPage, boxState } from '../../js/rowset.js';
export { sortKey, sortRows, filterRows };

// h('td', { 'data-x': 1 }, 'text' | node ...) builds an element; null, undefined and false attributes are skipped.
const h = (tag, attrs, ...kids) => { const e = document.createElement(tag); for (const k in attrs) attrs[k] && e.setAttribute(k, attrs[k] === true ? '' : attrs[k]); e.append(...kids); return e; };

export default Base => class extends Base {
    connected() {
        if (this.$c) return;
        this.$c = 1;
        const r = this.shadowRoot;
        r.addEventListener('click', e => this.click(e));
        r.addEventListener('change', e => this.input(e));
        r.addEventListener('input', e => this.input(e));
        for (const s of ['', 'toolbar', 'bulk', 'empty', 'footer', 'foot']) this.watchSlot(s, () => this.requestUpdate());
    }
    // columns / rows as arrays: json that parsed to something else (an object, a number) is a mistake, said once, and the table shows none.
    list(n) { const v = this[n]; return Array.isArray(v) ? (n == 'columns' && this.$cx ? this.$cx.cols(this, v) : v) : (this.warnOnce(n, n + ' is not an array'), []); }
    get view() { return this.manual ? this.list('rows') : sortRows(filterRows(this.list('rows'), this.filters), this.list('columns').find(c => c.key === this.sort), this.sortDir); }
    ids() { return rowIds(this.view, this.rowKey); }
    // Selection scope (#801): `selectScope` is 'all' once "Select all <total>" was chosen. The ids stay the loaded page (never 10k ids): the host expands
    // the scope itself. Any change of the ids, and a selection the host empties, leave it. A manual table keeps the ids of other pages (rows are replaced per page).
    get wide() { return this.selectScope === 'all' && this.selected.length > 0; }
    chosen(ids = this.ids()) { return this.wide ? new Set(ids) : idSet(this.selected); }
    pick(ids) { this.selected = ids; this.selectScope = 'page'; this.emit('pk-select', { selected: ids }); }
    sortBy(key, direction) { if (this.emit('pk-sort', { key, direction })) { this.sort = key ?? ''; this.sortDir = direction ?? 'ascending'; } }

    click(e) {
        const t = e.target, th = t.closest('th[data-key]'), tr = t.closest('tr[data-pk-context]');
        if (this.$m?.click(this, e) || this.$s?.click(this, e)) return;
        // The whole checkbox cell is the tap area: a click on the cell (not on the box) toggles the box.
        if (t.matches('[data-check]')) t.firstChild.click();
        else if (th && t.closest('button')) this.sortBy(...nextSort(this.sort, this.sortDir, th.dataset.key));
        else if (tr && this.clickable && !t.closest('input,button,a,select,label')) this.emit('pk-row-click', { id: tr.dataset.pkContext, row: rowAt(this.view, this.ids(), tr.dataset.pkContext) });
    }
    input(e) {
        const t = e.target, d = t.dataset;
        // A checkbox raises both change and input: the selection follows change only, so one click is one pk-select.
        if (e.type === 'change' && ('selectAll' in d || 'select' in d)) {
            // Under scope all every loaded row counts as selected, so a change starts from the loaded page.
            const ids = this.ids(), base = this.wide ? ids : this.selected;
            if ('select' in d) this.pick(toggleId(ids, base, d.select, t.checked, this.manual));
            else { this.pick(setPage(ids, base, t.checked, this.manual)); if (t.checked) this.$s?.page(this, ids.length); }
        }
        else if ('filter' in d && e.type === 'input') { clearTimeout(this.$t); this.$t = setTimeout(() => { const filters = { ...this.filters, [d.filter]: t.value }; if (this.emit('pk-filter', { filters })) this.filters = filters; }, 250); }
    }

    updated() {
        const own = this.slotted().some(e => e.localName === 'table'), tb = this.part('table');
        this.part('toolbar').hidden = !this.slotted('toolbar').length;
        tb.hidden = own;
        if (own) { this.part('bulk').hidden = this.part('empty').hidden = true; return; }
        if (this.selectScope === 'all' && !this.selected.length) this.selectScope = 'page';
        const k = this.list('columns'), r = V.view(this), ids = rowIds(r, this.rowKey), s =this.chosen(ids), sel = boxState(ids.filter(i => s.has(i)), r.length);
        if (this.expandable || this.clickable || this.rowHrefTemplate) this.$x ??= import('../../js/table-expand.js').then(m => { this.$m = m; this.requestUpdate(); }, e => this.log.error('table-expand failed', e));
        if (this.total) this.$p ??= import('../../js/table-scope.js').then(m => { this.$s = m; this.requestUpdate(); }, e => this.log.error('table-scope failed', e));
        if (this.editable) this.$w ??= import('../../js/table-edit.js').then(m => { this.$e = m; this.requestUpdate(); }, e => this.log.error('table-edit failed', e));
        if (this.resizable || this.reorderable) this.$cxw ??= import('../../js/table-cols.js').then(m => { this.$cx = m; this.requestUpdate(); }, e => this.log.error('table-cols failed', e));
        const x = this.expandable && this.$m, hx = this.expander != 'none' && x, lead = +this.selectable + !!hx;
        V.frame(this, tb, k.length + lead, r.length);

        this.part('head').replaceChildren(...V.head(this, k, hx, lead, sel, h));

        // Issue 131: at or above THRESHOLD rows, the body windows instead of drawing every row (table-vw.js). Never for an
        // expandable table (a detail row's height varies) or a host-supplied one (already returned above, at `if (own)`).
        const body = this.loading ? [h('tr', { 'data-skeleton': true }, h('td', { colspan: k.length + lead }, h('span', { class: 'sr', role: 'status' }, 'Loading')))] : V.body(this, r, h) ?? r.flatMap((row, i) => {
            const id = rowId(row, i, this.rowKey), tr = V.tr(this, row, id, s, h);
            return x ? x.rows(this, tr, id, i, k.length + lead, h) : [tr];
        });
        this.part('body').replaceChildren(...body);
        this.$m?.after(this); this.$e?.after(this); this.$cx?.after(this);
        this.$s?.after(this, r.length, sel.checked);
    }
};
