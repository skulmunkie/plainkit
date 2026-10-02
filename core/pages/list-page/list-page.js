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
        this.buildActions();
        table.config = this.config ?? {};
    }

    // Rebuilt only when config.actions itself changes: a toolbar action is data (label, href, variant), never a callback - a page that
    // needs one wired to app logic points its href at another route, the same way a module's own nav does.
    buildActions() {
        // Title bar: heading and breadcrumb only; config.actions stay the table's toolbar buttons below.
        showTitleBar(this, this.part('header'), { heading: this.config?.heading, breadcrumb: this.config?.breadcrumb });
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
};
