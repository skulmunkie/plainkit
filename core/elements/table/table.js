// <pk-table> behaviour. The sorting and filtering it applies to the rows is in js/table-data.js (the same exports are kept here).

import { sortKey, sortRows, filterRows, nextSort } from '../../js/table-data.js';
export { sortKey, sortRows, filterRows };

// h('td', { 'data-x': 1 }, 'text' | node ...) builds an element; null, undefined and false attributes are skipped.
const h = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const k in attrs) if (attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]); e.append(...kids); return e; };

export default Base => class extends Base {
    connected() {
        if (this.$c) return;
        this.$c = 1;
        const r = this.shadowRoot;
        r.addEventListener('click', e => this.click(e));
        r.addEventListener('change', e => this.input(e));
        r.addEventListener('input', e => this.input(e));
        for (const s of ['', 'toolbar', 'bulk', 'empty', 'footer']) this.watchSlot(s, () => this.requestUpdate());
    }
    // columns / rows as arrays: json that parsed to something else (an object, a number) is a mistake, said once, and the table shows none.
    list(n) { const v = this[n]; return Array.isArray(v) ? v : (this.warnOnce(n, n + ' is not an array'), []); }
    get view() { return this.manual ? this.list('rows') : sortRows(filterRows(this.list('rows'), this.filters), this.list('columns').find(c => c.key === this.sort), this.sortDir); }
    ids() { return this.view.map((r, i) => String(r[this.rowKey] ?? i)); }
    pick(ids) { this.selected = ids; this.emit('pk-select', { selected: ids }); }
    sortBy(key, direction) { if (this.emit('pk-sort', { key, direction })) { this.sort = key ?? ''; this.sortDir = direction ?? 'ascending'; } }

    click(e) {
        const t = e.target, th = t.closest('th[data-key]'), tr = t.closest('tbody tr[data-id]');
        if (this.$m?.click(this, e)) return;
        // The whole checkbox cell is the tap area: a click on the cell (not on the box) toggles the box.
        if (t.matches('[data-check]')) t.firstChild.click();
        else if (th && t.closest('button')) this.sortBy(...nextSort(this.sort, this.sortDir, th.dataset.key));
        else if (tr && this.clickable && !t.closest('input,button,a,select,label')) this.emit('pk-row-click', { id: tr.dataset.id, row: this.view[this.ids().indexOf(tr.dataset.id)] });
    }
    input(e) {
        const t = e.target, d = t.dataset;
        // A checkbox raises both change and input: the selection follows change only, so one click is one pk-select.
        if ('selectAll' in d && e.type === 'change') this.pick(t.checked ? this.ids() : []);
        else if ('select' in d && e.type === 'change') { const on = new Set(this.selected.map(String)); on[t.checked ? 'add' : 'delete'](d.select); this.pick(this.ids().filter(x => on.has(x))); }
        else if ('filter' in d && e.type === 'input') { clearTimeout(this.$t); this.$t = setTimeout(() => { const filters = { ...this.filters, [d.filter]: t.value }; if (this.emit('pk-filter', { filters })) this.filters = filters; }, 250); }
    }

    updated() {
        const own = this.slotted().some(e => e.localName === 'table'), tb = this.part('table');
        this.part('toolbar').hidden = this.slotted('toolbar').length === 0;
        tb.hidden = own;
        if (own) { this.part('bulk').hidden = this.part('empty').hidden = true; return; }
        const cols = this.list('columns'), rows = this.view, sel = new Set(this.selected.map(String));
        if (this.expandable || this.clickable) this.$x ??= import('../../js/table-expand.js').then(m => { this.$m = m; this.requestUpdate(); }, e => this.log.error('table-expand did not load', e));
        const x = this.expandable && this.$m, lead = Number(this.selectable) + Number(!!x);
        const al = c => c.align ?? (c.type === 'number' ? 'end' : null), ph = c => c.hidePhone;
        tb.setAttribute('aria-busy', String(this.loading));
        if (this.maxHeight) this.style.setProperty('--pk-table-max-height', this.maxHeight); else this.style.removeProperty('--pk-table-max-height');

        const box = h('input', { type: 'checkbox', 'data-select-all': true, 'aria-label': 'Select all rows' });
        box.checked = rows.length > 0 && sel.size >= rows.length; box.indeterminate = sel.size > 0 && sel.size < rows.length;
        const head = [h('tr', {}, ...(this.selectable ? [h('th', { 'data-check': true }, box)] : []), ...(x ? [x.head(h)] : []),
            ...cols.map(c => h('th', { 'data-key': c.key, 'data-align': al(c), 'data-hide-phone': ph(c), scope: 'col', 'aria-sort': c.sortable ? (this.sort === c.key ? this.sortDir : 'none') : null }, c.sortable ? h('button', { type: 'button' }, c.label ?? c.key) : (c.label ?? c.key))))];
        if (this.filterable) head.push(h('tr', { 'data-filters': true }, ...(lead ? [h('th', { colspan: lead })] : []), ...cols.map(c => h('th', { 'data-hide-phone': ph(c) }, h('input', { type: 'search', 'data-filter': c.key, 'aria-label': `Filter ${c.label ?? c.key}`, value: this.filters[c.key] ?? '' })))));
        this.part('head').replaceChildren(...head);

        const body = this.loading ? [h('tr', { 'data-skeleton': true }, h('td', { colspan: cols.length + lead }, h('span', { class: 'sr', role: 'status' }, 'Loading')))] : rows.flatMap((row, i) => {
            const id = String(row[this.rowKey] ?? i), pick = h('input', { type: 'checkbox', 'data-select': id, 'aria-label': `Select row ${id}` });
            pick.checked = sel.has(id);
            const tr = h('tr', { 'data-id': id, 'data-selected': sel.has(id), 'data-clickable': this.clickable, 'aria-current': this.currentRow && this.currentRow === id ? 'true' : null },
                ...(this.selectable ? [h('td', { 'data-check': true }, pick)] : []),
                ...cols.map(c => { const name = `cell-${id}-${c.key}`; return h('td', { 'data-label': c.label ?? c.key, 'data-align': al(c), 'data-hide-phone': ph(c) }, this.querySelector(`:scope > [slot="${name}"]`) ? h('slot', { name }) : String(row[c.key] ?? '')); }));
            return x ? x.rows(this, tr, id, i, cols.length + lead, h) : [tr];
        });
        this.part('body').replaceChildren(...body);
        this.$m?.after(this);
        this.part('empty').hidden = this.loading || rows.length > 0;
        this.part('bulk').hidden = sel.size === 0; this.part('bulk-count').textContent = `${sel.size} selected`;
    }
};
