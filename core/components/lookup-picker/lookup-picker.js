// pk-lookup-picker behaviour (see meta.json). A field whose popup holds a searchable, pageable pk-data-table (the query/load/state machine of
// #801), for option sets too large for pk-combobox. Composition: the field is a pk-button that opens a pk-popover (placement, outside press,
// Escape, focus leaving and focus back to the trigger are the popover's), and the popup is built on first open, so a closed picker loads nothing
// but itself. ARIA: the popover marks the trigger aria-haspopup="dialog" and aria-expanded and labels the panel; the search box and the rows
// are real controls inside it, so focus really moves in (an aria-activedescendant cannot cross the table's shadow roots).
import { loadElements } from '../../js/loader.js';
import { focusTrigger } from '../../js/overlay.js';

// The text an option shows: its labelKey field, else its key.
export const labelOf = (row, labelKey, key) => String(row?.[labelKey] ?? row?.[key] ?? '');
// What a host's resolve(keys) may return, as one { key: label } map: that map, or an array of { key | value | id, label }.
export function labelMap(result) {
    if (Array.isArray(result)) return Object.fromEntries(result.map(r => [String(r.key ?? r.value ?? r.id), String(r.label ?? '')]));
    return result && typeof result === 'object' ? Object.fromEntries(Object.entries(result).map(([k, v]) => [k, String(v)])) : {};
}
// The row to focus from `at` (an index, -1 for none) for an arrow, Home or End key; null for any other key.
export function rowStep(at, count, key) {
    if (!count) return null;
    if (key === 'ArrowDown') return Math.min(at + 1, count - 1);
    if (key === 'ArrowUp') return Math.max(at - 1, 0);
    return key === 'Home' ? 0 : key === 'End' ? count - 1 : null;
}
const rowsOf = dt => [...(dt.part('table')?.shadowRoot?.querySelectorAll('tbody tr[data-pk-context]') ?? [])];

export default Base => class extends Base {
    connected() {
        if (this.$init) return;
        this.$init = true; this.$initial = this.value;
        // The popover and the button of the field (the table waits for the first open). Props are written to the popover only once it is defined:
        // pk-popover keeps its auto-update stop in this.$u, which the base class also uses for props set before an upgrade, so a pre-upgrade write breaks it (reported on #801).
        loadElements(this.shadowRoot).then(() => this.requestUpdate());
        const pop = this.part('popover');
        // The popover opens and closes itself (a click, Escape, an outside press, focus leaving): mirror that into `open`.
        // Their events stop here: the host hears pk-lookup-toggle. A key closes it with focus back on the field (the popover does that only when focus is in its own tree).
        pop.addEventListener('pk-open', e => { e.stopPropagation(); this.mirror(true); this.focusIn(); });
        pop.addEventListener('pk-close', e => {
            e.stopPropagation();
            if (e.defaultPrevented) return;
            this.mirror(false);
            if (e.detail?.reason !== 'outside' && e.detail?.reason !== 'blur') focusTrigger(this.part('control'));
        });
        pop.addEventListener('click', e => { if (this.readonly) e.stopPropagation(); }, true); // a read-only field shows its value and never opens
        this.part('control').addEventListener('keydown', e => { if (!this.open && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && !this.readonly && !this.disabled) { e.preventDefault(); this.mirror(true); } });
        pop.addEventListener('keydown', e => this.rowKeys(e));
    }
    get labels() { return this.$labels ??= new Map(); }
    show() { if (!this.disabled && !this.readonly) this.open = true; }
    hide() { this.open = false; }
    // A change the popover made: say so once, so a host that mirrors `open` hears it.
    mirror(open) { if (this.open !== open) this.emit('pk-lookup-toggle', { open: this.open = open }, { cancelable: false }); }
    // From the search box Down enters the rows; on a row the arrows, Home and End walk them (pk-table gives each clickable row a tab stop).
    rowKeys(e) {
        const src = e.composedPath()[0], rows = this.$dt ? rowsOf(this.$dt) : [];
        const at = rows.indexOf(src), next = rowStep(at, rows.length, e.key);
        if (next === null || (at < 0 && e.key !== 'ArrowDown')) return;
        e.preventDefault(); rows[at < 0 ? 0 : next]?.focus();
    }
    say(text) { this.part('status').textContent = text; }
    // The popup's table, built on the first open: the element loader fetches pk-data-table only now.
    ensureTable() {
        if (this.$dt) return this.$dt;
        const dt = this.$dt = this.shadowRoot.querySelector('template').content.firstElementChild.cloneNode(true);
        dt.clickable = true;
        dt.load = async (q, o) => {
            this.say('Loading');
            try {
                const r = await this.load?.(q, o);
                this.say(`${r?.total ?? r?.rows?.length ?? 0} results`);
                return r;
            } finally { queueMicrotask(() => this.tryFocus()); }
        };
        dt.addEventListener('pk-row-click', e => { e.stopPropagation(); this.pick(e.detail); });
        this.part('popover').append(dt);
        // The search box lives in pk-table-filters, which the table itself loads on demand: try again once that element is defined and has drawn.
        const win = this.ownerDocument.defaultView;
        loadElements(this.shadowRoot).then(() => win.customElements.whenDefined('pk-table-filters')).then(() => this.tryFocus());
        return dt;
    }
    pick({ id, row }) {
        this.labels.set(id, labelOf(row, this.labelKey, this.rowKey));
        this.value = id;
        this.mirror(false);
        focusTrigger(this.part('control'));
        for (const t of ['input', 'change']) this.dispatchEvent(new Event(t, { bubbles: true, composed: true }));
        this.emit('pk-lookup-select', { value: id, label: this.labels.get(id), row });
    }
    // The label for the current value: one picked in this session, one the host supplied, else what resolve(keys) answers (the key meanwhile is not shown).
    labelFor(value) {
        if (value === '') return '';
        const label = this.labels.get(value) ?? this.selectedLabels?.[value];
        if (label !== undefined) return label;
        if (typeof this.resolve !== 'function') return value;
        if (this.$asked !== value) {
            this.$asked = value;
            const token = this.$token = {};
            Promise.resolve().then(() => this.resolve([value])).then(r => {
                if (this.$token !== token) return;
                for (const [k, v] of Object.entries(labelMap(r))) this.labels.set(k, v);
                this.requestUpdate();
            }, error => { this.$asked = null; this.warnOnce(`resolve() rejected: ${error?.message ?? error}`); });
        }
        return '';
    }
    updated() {
        const pop = this.part('popover'), btn = this.part('control'), text = this.part('text');
        const shown = this.labelFor(this.value);
        text.textContent = shown || this.placeholder;
        text.toggleAttribute('data-placeholder', !shown);
        btn.label = [this.label, shown || this.placeholder].filter(Boolean).join(': ');
        btn.toggleAttribute('aria-invalid', !!this.invalid);
        if (pop.open !== undefined && pop.open !== !!this.open) pop.open = !!this.open;
        if (this.open) {
            const dt = this.ensureTable();
            dt.rowKey = this.rowKey; dt.currentRow = this.value;
            // config is handed over only when it changed: setting it makes the table load again.
            const cfg = { searchLabel: `Search ${this.label || 'options'}`, label: this.label, ...this.config }, key = JSON.stringify(cfg);
            if (key !== this.$cfg) { this.$cfg = key; dt.config = cfg; }
        } else this.$wantFocus = false;
        this.setValidity(this.required && this.value === '' ? { valueMissing: true } : {}, 'Choose an option.', btn);
        this.setFormValue(this.value);
    }
    // Focus enters the popup on open: the search box, as soon as the table has drawn it. Tried when the popup opens, when the table's elements
    // are defined and after each load, until it lands.
    focusIn() { this.$wantFocus = true; this.tryFocus(); }
    tryFocus() {
        if (!this.$wantFocus || !this.open || !this.$dt) return;
        const box = typeof this.$dt.part === 'function' ? this.$dt.part('filters')?.shadowRoot?.querySelector('[part="search"]') : null;
        if (!box || box.getBoundingClientRect().width === 0) return;
        this.$wantFocus = false; box.focus();
    }
    onReset() { this.value = this.$initial ?? ''; this.$asked = null; }
    onRestore(state) { this.value = state ?? ''; }
    focus(o) { this.part('control').focus(o); }
};
