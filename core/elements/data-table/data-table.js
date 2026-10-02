import { showState } from '../../js/page-shell.js';
import { loadElements } from '../../js/loader.js';
import { filterControl } from '../../js/filter-controls.js';

// The one query/load/selection machine of a paged list (#801): pk-list-page, the lookup picker and Blazor's PkDataTable all sit on this element.
export default Base => class extends Base {
    connected() {
        // Cell content (#817): the host's `cell-<id>-<key>` children are re-slotted into the inner pk-table, which finds them as its own children.
        (this.$mo ??= new MutationObserver(() => this.forwardSlots())).observe(this, { childList: true });
        if (this.$w) return;
        this.$w = true;
        loadElements(this.shadowRoot);
        const table = this.part('table'), filters = this.part('filters'), pagination = this.part('pagination');
        // `narrows`: a search or filter changes WHICH rows the query means, so a selection of "all rows" no longer holds (the ids stay selected).
        const go = (patch, narrows) => {
            this.$query = { ...this.query, ...patch }; this.$touched = true;
            if (narrows && this.selectScope === 'all') { this.selectScope = 'page'; this.announce(); }
            this.refresh();
        };
        table.addEventListener('pk-sort', e => go({ sort: e.detail.key, sortDir: e.detail.direction ?? 'ascending', page: 1 }));
        table.addEventListener('pk-row-click', e => this.rowHref?.(e.detail.row));
        // pk-table's own selection events stop here: the host hears one pk-select with the ids, the scope and the query.
        table.addEventListener('pk-select', e => { e.stopPropagation(); this.selected = e.detail.selected; this.selectScope = 'page'; this.announce(); });
        table.addEventListener('pk-select-all', e => { e.stopPropagation(); if (e.detail.scope === 'all') { this.selectScope = 'all'; this.announce(); } });
        filters.addEventListener('pk-search', e => go({ search: e.detail.query, page: 1 }, true));
        filters.addEventListener('pk-value-change', e => {
            const key = e.target?.dataset?.key;
            if (!key) return;
            go({ filters: { ...this.query.filters, [key]: e.detail?.value }, page: 1 }, true);
            this.updateFilterCount();
        });
        filters.addEventListener('pk-clear-filters', () => { for (const el of Object.values(this.$controls ?? {})) el.value = ''; go({ filters: {}, page: 1 }, true); this.updateFilterCount(); });
        pagination.addEventListener('pk-page', e => go({ page: e.detail.page }));
        pagination.addEventListener('pk-page-size', e => go({ pageSize: e.detail.pageSize, page: 1 }));
        this.buildFilters();
        this.refresh();
    }
    disconnected() { this.$mo?.disconnect(); this.$abort?.abort(); }
    forwardSlots() {
        const table = this.part('table'), names = [...this.children].map(c => c.slot).filter(s => s?.startsWith('cell-')), have = [...table.children].filter(c => c.name?.startsWith('cell-'));
        if (names.join() === have.map(c => c.name).join()) return;
        for (const c of have) c.remove();
        for (const name of names) { const s = this.ownerDocument.createElement('slot'); s.name = s.slot = name; table.append(s); }
        table.requestUpdate();
    }
    changed(name) {
        if (!this.$w) return;
        // A config that arrives after the first draw (a wrapper sets props after connecting) still decides the initial page size and sort, until the reader changes the query.
        if (name === 'config') { if (!this.$touched) this.$query = null; this.buildFilters(); this.refresh(); }
        else this.sync();
    }

    /** The current query { page, pageSize, sort, sortDir, search, filters }: what load() last received, and what a bulk action for scope 'all' runs against. */
    get query() { return { ...(this.$query ??= { page: 1, pageSize: this.config?.pageSize || 25, sort: this.config?.sort ?? null, sortDir: this.config?.sortDir ?? 'ascending', search: '', filters: {} }) }; }

    announce() { this.emit('pk-select', { selected: [...(this.selected ?? [])], scope: this.selectScope, query: this.query }); }

    // Rebuilt only when config.filters itself changes (a JSON prop, so a cheap string compare is the dirty check): every other prop change
    // must never wipe what the reader already typed into a filter.
    buildFilters() {
        const key = JSON.stringify(this.config?.filters ?? []);
        if (key === this.$filtersFor) return;
        this.$filtersFor = key;
        const box = this.part('filters');
        box.replaceChildren();
        this.$controls = {};
        for (const f of this.config?.filters ?? []) box.append(this.$controls[f.key] = filterControl(this.ownerDocument, f));
        loadElements(box);
        this.updateFilterCount();
    }
    updateFilterCount() { this.part('filters').filterCount = Object.values(this.query.filters).filter(v => String(v ?? '').trim() !== '').length; }

    // The table's own props follow the query and the selection state.
    sync() {
        const table = this.part('table'), q = this.query, c = this.config ?? {}, filters = this.part('filters'), pagination = this.part('pagination');
        this.forwardSlots();
        // The labels and inputs of the parts, from config (each one's own prop; searchLabel is both the placeholder and the accessible name of the search box).
        filters.label = c.searchLabel ?? 'Search'; filters.debounce = c.searchDebounce ?? 250; filters.toggleAttribute('data-nosearch', c.searchable === false);
        pagination.sizes = c.pageSizeOptions ?? []; pagination.label = c.pagerLabel ?? 'Pagination';
        table.label = c.label ?? ''; table.caption = c.caption ?? '';
        table.columns = this.config?.columns ?? [];
        table.rowKey = this.rowKey;
        table.clickable = this.clickable || typeof this.rowHref === 'function';
        table.currentRow = this.currentRow;
        table.sort = q.sort ?? '';
        table.sortDir = q.sortDir;
        table.selectable = this.selectable;
        table.selected = this.selected ?? [];
        table.selectScope = this.selectScope;
        for (const k of ['cards', 'striped', 'density', 'maxHeight', 'stickyHeader']) table[k] = this[k];
    }

    // Runs load(query) for the current page/sort/filter/search and draws the result: a loading state while it is in flight, an error state
    // with Retry if it rejects, the configured empty state for zero rows, or the table itself. A request started while an older one is still
    // in flight is the only one that gets to draw (a token, the same guard js/app/module.js's own request cancellation makes at the module level).
    async refresh() {
        const table = this.part('table'), state = this.part('state'), q = this.query;
        this.sync();
        const token = (this.$token = {});
        // A new request cancels the one still in flight: load(query, { signal }) can pass the signal on to fetch.
        this.$abort?.abort();
        const { signal } = (this.$abort = new AbortController());
        table.hidden = true;
        showState(state, 'loading', { label: 'Loading' });
        if (typeof this.load !== 'function') { showState(state, 'empty', this.config?.empty); return; }
        let result;
        try {
            result = await this.load(q, { signal });
        } catch (err) {
            if (this.$token !== token) return;
            showState(state, 'error', { error: err, retry: () => this.refresh() });
            return;
        }
        if (this.$token !== token) return;
        const rows = result?.rows ?? [], total = result?.total ?? rows.length;
        if (rows.length === 0) { showState(state, 'empty', this.config?.empty); return; }
        showState(state, 'ready');
        table.hidden = false;
        table.total = this.selectable ? total : 0;
        table.rows = rows;
        const pagination = this.part('pagination');
        pagination.total = total;
        pagination.pageSize = q.pageSize;
        pagination.page = q.page;
    }
};
