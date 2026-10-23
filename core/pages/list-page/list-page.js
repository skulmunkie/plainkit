import { showTitleBar } from '../../js/page-shell.js';
import { loadElements } from '../../js/loader.js';

const TABLE_KEYS = ['columns', 'filters', 'pageSize', 'pageSizeOptions', 'sort', 'sortDir', 'search', 'filterValues', 'page', 'searchDebounce', 'pagerLabel', 'label', 'caption', 'empty', 'noResults', 'loadError', 'stickyHeader', 'selectPageOnly'];

// The page frame around a pk-data-table, which owns the query, load and states (#801).
export default Base => class extends Base {
    connected() {
        if (this.$w) return;
        this.$w = true;
        loadElements(this.shadowRoot);
        this.sync();
        // Host `cell-<id>-<key>` children are re-slotted into the table (#1000, #817).
        (this.$mo = new MutationObserver(() => { this.forwardSlots(); this.showHeaderSlot(); })).observe(this, { childList: true });
        this.forwardSlots();
        const slot = this.shadowRoot?.querySelector?.('slot[name="before-list"]'), before = this.part('before');
        if (slot && before) { const show = () => { before.hidden = !slot.assignedNodes().length; }; slot.addEventListener('slotchange', show); show(); }
    }
    disconnected() { this.$mo?.disconnect(); this.$w = false; }
    // The bridge calls this when `load` is set after the first (empty) draw (#1401).
    refresh() { return this.part('table')?.refresh?.(); }
    forwardSlots() {
        const table = this.part('table'), names = [...this.children].map(c => c.slot).filter(s => s?.startsWith('cell-')), have = [...table.children].filter(c => c.name?.startsWith('cell-'));
        if (names.join() === have.map(c => c.name).join()) return;
        for (const c of have) c.remove();
        for (const name of names) { const s = this.ownerDocument.createElement('slot'); s.name = s.slot = name; table.append(s); }
    }
    part(name) { const t = super.part('table'); return super.part(name) ?? (typeof t?.part === 'function' ? t.part(name) : null); }
    changed(name) { if ((name === 'config' || name === 'clickable' || name === 'rowHrefTemplate' || name === 'navigate') && this.$w) this.sync(); }

    sync() {
        const table = this.part('table');
        table.load = q => (typeof this.load === 'function' ? this.load(q) : { rows: [] });
        table.rowHref = typeof this.rowHref === 'function' ? row => this.rowHref(row) : null;
        table.clickable = !!this.clickable; table.rowHrefTemplate = this.rowHrefTemplate; table.navigate = this.navigate;
        table.selectable = !!this.config?.selectable;
        if (this.config?.rowKey) table.rowKey = this.config.rowKey;
        this.buildActions();
        const cfg = this.config ?? {};
        for (const k of TABLE_KEYS) table[k] = cfg[k];
        table.hideSearch = cfg.searchable === false;
        table.searchLabel = cfg.searchLabel ?? cfg.searchPlaceholder; table.searchPlaceholder = cfg.searchPlaceholder;
        table.cards = cfg.cards ?? !cfg.selectable; // a card has no select-all
    }

    showHeaderSlot() {
        if (this.config?.toolbarInHeader) return;
        if ([...this.children].some(c => c.slot === 'actions')) this.part('header').setAttribute('data-bare', 'false');
    }

    // Rebuilt only when config.actions changes: link buttons; app logic goes in the actions or toolbar slot.
    buildActions() {
        const inBar = !!this.config?.toolbarInHeader;
        showTitleBar(this, this.part('header'), inBar ? {} : { ...this.config, actions: [] });
        this.buildLead(inBar);
        this.showHeaderSlot();
        this.fill('actions', this.config?.actions);
        this.fill('bulk', this.config?.selectable ? this.config?.bulkActions : null);
    }

    // toolbarInHeader (#1723): the title goes to the table's lead slots, the host actions to its actions slot; the shell header stays bare.
    buildLead(on) {
        const t = this.part('table'), { heading, breadcrumb } = this.config ?? {}, h = this.shadowRoot?.querySelector?.('pk-page-shell > slot[slot="actions"]');
        showTitleBar(this, t, on ? { heading, breadcrumb } : {});
        t.$bar.push(...(on ? [Object.assign(this.ownerDocument.createElement('slot'), { name: 'actions', slot: 'actions' })] : []));
        if (h) h.name = on ? 'x' : 'actions';
        t.append?.(...t.$bar);
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
