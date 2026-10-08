import { showState } from '../../js/page-shell.js';
import { loadElements } from '../../js/loader.js';
import { filterControl } from '../../js/filter-controls.js';

// The one query/load/selection machine of a paged list (#801): pk-list-page, the lookup picker and Blazor's PkDataTable all sit on this element.
// The settings a plain prop and the same key of config can both give: the plain prop wins once it differs from its default (#805), config is the fallback, then the default.
// The defaults are the meta's (a test holds them together).
export const DEFAULTS = { columns: [], pageSize: 25, pageSizeOptions: null, sort: '', sortDir: 'ascending', hideSearch: false, search: '', searchLabel: '', searchDebounce: 250, pagerLabel: '', label: '', caption: '', empty: null, noResults: null, loadError: '' };
const SETTINGS = Object.keys(DEFAULTS);

export default Base => class extends Base {
    opt(name) {
        const d = DEFAULTS[name], v = this[name] ?? d, set = Array.isArray(d) ? v.length > 0 : v !== d;
        return set ? v : (this.config?.[name] ?? d);
    }
    connected() {
        // Cell content (#817): the host's `cell-<id>-<key>` children are re-slotted into the inner pk-table, which finds them as its own children.
        (this.$mo ??= new MutationObserver(() => this.forwardSlots())).observe(this, { childList: true });
        if (this.$w) return;
        this.$w = true;
        loadElements(this.shadowRoot);
        // The inner pk-table loads on demand: props set on it before it is defined (clickable above all) are applied again once it is.
        this.ownerDocument.defaultView?.customElements.whenDefined('pk-table').then(() => this.sync());
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
        this.part('add').addEventListener('click', () => this.emit('pk-add', null));
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
        if (name === 'config' || SETTINGS.includes(name)) { const s = this.opt('search'); if (!this.$touched) this.$query = null; else if (s !== this.$seed) this.$query = { ...this.query, search: s, page: 1 }; this.buildFilters(); this.refresh(); }
        else this.sync();
    }

    /** The current query { page, pageSize, sort, sortDir, search, filters }: what load() last received, and what a bulk action for scope 'all' runs against. */
    get query() { return { ...(this.$query ??= { page: 1, pageSize: this.opt('pageSize') || 25, sort: this.opt('sort') || null, sortDir: this.opt('sortDir') || 'ascending', search: this.opt('search'), filters: {} }) }; }

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
        this.part('add').hidden = !this.addLabel; this.part('add').textContent = this.addLabel;
        const table = this.part('table'), q = this.query, filters = this.part('filters'), pagination = this.part('pagination');
        this.forwardSlots();
        // The labels and inputs of the parts, from config (each one's own prop; searchLabel is both the placeholder and the accessible name of the search box).
        filters.label = this.opt('searchLabel') || 'Search'; filters.debounce = this.opt('searchDebounce'); filters.toggleAttribute('data-nosearch', this.hideSearch || this.config?.searchable === false);
        pagination.sizes = this.opt('pageSizeOptions') ?? []; pagination.label = this.opt('pagerLabel') || 'Pagination';
        if (this.opt('search') !== this.$seed) filters.value = this.$seed = this.opt('search');
        table.label = this.opt('label'); table.caption = this.opt('caption');
        table.columns = this.opt('columns');
        table.rowKey = this.rowKey;
        table.clickable = this.clickable || typeof this.rowHref === 'function';
        table.currentRow = this.currentRow;
        table.sort = q.sort ?? '';
        table.sortDir = q.sortDir;
        table.selectable = this.selectable;
        table.selected = this.selected ?? [];
        table.selectScope = this.selectScope;
        for (const k of ['selectPageOnly', 'cards', 'striped', 'density', 'maxHeight', 'stickyHeader']) table[k] = this[k];
    }

    // Zero rows: while a search or filter is active config.noResults (when set), else config.empty; with nothing active a host child in the `empty` slot replaces the built-in state.
    showEmpty(q) {
        const state = this.part('state'), noResults = this.opt('noResults'), searching = q.search || Object.values(q.filters).some(v => String(v ?? '').trim() !== '');
        if (!searching && this.querySelector(':scope > [slot="empty"]')) { showState(state, 'ready'); this.part('empty').hidden = false; }
        else showState(state, 'empty', searching && noResults ? noResults : this.opt('empty') ?? undefined);
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
        table.hidden = this.part('empty').hidden = true;
        showState(state, 'loading', { label: 'Loading' });
        if (typeof this.load !== 'function') { this.showEmpty(q); return; }
        let result;
        try {
            result = await this.load(q, { signal });
        } catch (err) {
            if (this.$token !== token) return;
            showState(state, 'error', { heading: this.opt('loadError') || undefined, error: err, retry: () => this.refresh() });
            this.emit('pk-load-error', { error: err });
            return;
        }
        if (this.$token !== token) return;
        const rows = result?.rows ?? [], total = result?.total ?? rows.length;
        // Rows deleted under the reader: a page past the last one settles on the last page (one more load), not the empty state.
        if (rows.length === 0 && total > 0 && q.page > Math.ceil(total / q.pageSize)) { this.$query = { ...q, page: Math.ceil(total / q.pageSize) }; return this.refresh(); }
        if (rows.length === 0) { this.showEmpty(q); return; }
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
