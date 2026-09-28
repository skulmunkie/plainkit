import { showState } from '../../js/page-shell.js';
import { renderState } from '../../js/page-states.js';
import { loadElements } from '../../js/loader.js';
import { filterControl } from '../../js/filter-controls.js';

export default Base => class extends Base {
    connected() {
        if (this.$w) return;
        this.$w = true;
        // The table, filter panel, actions and pager are real pk-* elements in this shadow tree from the start (the static template,
        // build-time bundled with this element - core/elements/tool-page does the same for its own Run button); load them once here.
        loadElements(this.shadowRoot);
        const table = this.part('table'), filters = this.part('filters'), pagination = this.part('pagination');
        table.addEventListener('pk-sort', e => { this.$query = { ...this.$query, sort: e.detail.key, sortDir: e.detail.direction ?? 'ascending', page: 1 }; this.refresh(); });
        table.addEventListener('pk-row-click', e => { if (typeof this.rowHref === 'function') this.rowHref(e.detail.row); });
        filters.addEventListener('pk-search', e => { this.$query = { ...this.$query, search: e.detail.query, page: 1 }; this.refresh(); });
        filters.addEventListener('pk-value-change', e => this.onFilterChange(e));
        filters.addEventListener('pk-clear-filters', () => { this.$query = { ...this.$query, filters: {}, page: 1 }; this.resetFilterControls(); this.refresh(); });
        pagination.addEventListener('pk-page', e => { this.$query = { ...this.$query, page: e.detail.page }; this.refresh(); });
        pagination.addEventListener('pk-page-size', e => { this.$query = { ...this.$query, pageSize: e.detail.pageSize, page: 1 }; this.refresh(); });
        this.buildFilters();
        this.buildActions();
        this.refresh();
    }
    changed(name) {
        if (name !== 'config') return;
        this.buildFilters();
        this.buildActions();
        this.refresh();
    }

    // Rebuilt only when config.filters itself changes (a JSON prop, so a cheap string compare is the dirty check): every other prop change
    // must never wipe what the reader already typed into a filter.
    buildFilters() {
        const key = JSON.stringify(this.config?.filters ?? []);
        if (key === this.$filtersFor) return;
        this.$filtersFor = key;
        const doc = this.ownerDocument;
        const box = this.part('filters');
        box.replaceChildren();
        this.$filterControls = {};
        for (const f of this.config?.filters ?? []) {
            const el = filterControl(doc, f);
            box.append(el);
            this.$filterControls[f.key] = el;
        }
        loadElements(box);
        this.updateFilterCount();
    }
    resetFilterControls() {
        for (const el of Object.values(this.$filterControls ?? {})) el.value = '';
        this.updateFilterCount();
    }
    updateFilterCount() {
        this.part('filters').filterCount = Object.values(this.$query?.filters ?? {}).filter(v => String(v ?? '').trim() !== '').length;
    }
    onFilterChange(e) {
        const key = e.target?.dataset?.key;
        if (!key) return;
        this.$query = { ...this.$query, filters: { ...this.$query.filters, [key]: e.detail?.value }, page: 1 };
        this.updateFilterCount();
        this.refresh();
    }

    // Rebuilt only when config.actions itself changes: a toolbar action is data (label, href, variant), never a callback - a page that
    // needs one wired to app logic points its href at another route, the same way a module's own nav does.
    buildActions() {
        const key = JSON.stringify(this.config?.actions ?? []);
        if (key === this.$actionsFor) return;
        this.$actionsFor = key;
        const doc = this.ownerDocument;
        const box = this.part('actions');
        box.replaceChildren();
        for (const a of this.config?.actions ?? []) {
            const btn = doc.createElement('pk-button');
            if (a.variant) btn.variant = a.variant;
            if (a.href) btn.href = a.href;
            btn.textContent = a.label ?? '';
            box.append(btn);
        }
        loadElements(box);
    }

    // Runs load(query) for the current page/sort/filter/search and draws the result: a loading state while it is in flight, an error state
    // with Retry if it rejects, the configured empty state for zero rows, or the table itself. A request started while an older one is still
    // in flight is the only one that gets to draw (a token, the same guard js/app/module.js's own request cancellation makes at the module level).
    async refresh() {
        this.$query ??= { page: 1, pageSize: this.config?.pageSize || 25, sort: null, sortDir: 'ascending', search: '', filters: {} };
        const table = this.part('table'), state = this.part('state');
        table.columns = this.config?.columns ?? [];
        table.clickable = typeof this.rowHref === 'function';
        table.sort = this.$query.sort ?? '';
        table.sortDir = this.$query.sortDir;
        const token = (this.$token = {});
        table.hidden = true;
        showState(state, 'loading', { label: 'Loading' });
        if (typeof this.load !== 'function') { showState(state, 'empty', this.config?.empty); return; }
        let result;
        try {
            result = await this.load({ ...this.$query });
        } catch (err) {
            if (this.$token !== token) return;
            showState(state, 'error', { error: err, retry: () => this.refresh() });
            return;
        }
        if (this.$token !== token) return;
        const rows = result?.rows ?? [], total = result?.total ?? rows.length;
        if (rows.length === 0) { showState(state, 'empty', this.config?.empty); return; }
        renderState(state, 'ready');
        table.hidden = false;
        table.rows = rows;
        const pagination = this.part('pagination');
        pagination.total = total;
        pagination.pageSize = this.$query.pageSize;
        pagination.page = this.$query.page;
    }
};
