import { showTitleBar } from '../../js/page-shell.js';
import { loadElements } from '../../js/loader.js';

// The page frame (title bar, toolbar actions, the callbacks) around a pk-data-table, which owns the query, the load and the states (#801).
export default Base => class extends Base {
    connected() {
        if (this.$w) return;
        this.$w = true;
        loadElements(this.shadowRoot);
        this.sync();
    }
    // The data table's own parts (filters, pagination, state) stay reachable here under the names this page always had.
    part(name) { return super.part(name) ?? super.part('table')?.part?.(name) ?? null; }
    changed(name) { if (name === 'config' && this.$w) this.sync(); }

    sync() {
        const table = this.part('table');
        // The callbacks are handed down as they are now; a missing load shows the configured empty state, a missing rowHref leaves rows unclickable.
        table.load = q => (typeof this.load === 'function' ? this.load(q) : { rows: [] });
        table.rowHref = typeof this.rowHref === 'function' ? row => this.rowHref(row) : null;
        // Selection is the table's: this page only switches it on (its pk-select is composed, so the host hears it as it is) and fills the bulk bar.
        table.selectable = !!this.config?.selectable;
        if (this.config?.rowKey) table.rowKey = this.config.rowKey;
        this.buildActions();
        table.config = this.config ?? {};
    }

    // Rebuilt only when config.actions itself changes: a toolbar action is data (label, href, variant), never a callback - a page that
    // needs one wired to app logic points its href at another route, the same way a module's own nav does.
    buildActions() {
        // Title bar: heading and breadcrumb only; config.actions stay the table's toolbar buttons below.
        showTitleBar(this, this.part('header'), { heading: this.config?.heading, breadcrumb: this.config?.breadcrumb });
        this.fill('actions', this.config?.actions);
        this.fill('bulk', this.config?.selectable ? this.config?.bulkActions : null);
    }

    // One pk-button per entry. A bulk action ({ id, label, variant? }) raises pk-bulk with its id and the table's selection, { action, selected, scope, query }.
    fill(name, list) {
        const key = JSON.stringify(list ?? []);
        if (key === this['$' + name]) return;
        this['$' + name] = key;
        const box = this.part(name);
        box.replaceChildren();
        for (const a of list ?? []) {
            const btn = this.ownerDocument.createElement('pk-button');
            if (a.variant) btn.variant = a.variant;
            if (a.href) btn.href = a.href;
            btn.textContent = a.label ?? '';
            if (name === 'bulk') {
                const table = this.part('table');
                btn.addEventListener('click', () => this.emit('pk-bulk', { action: a.id ?? a.label, selected: [...(table.selected ?? [])], scope: table.selectScope, query: table.query }));
            }
            box.append(btn);
        }
        loadElements(box);
    }
};
