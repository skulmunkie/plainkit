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
// A multiple selection under a limit: `next` replaces `prev` unless it would hold more than max (0 or less: no limit), then `prev` stays and `refused` says so.
export const limitSelection = (prev, next, max) => (max > 0 && next.length > max ? { values: prev, refused: true } : { values: next, refused: false });
const rowsOf =dt => [...(dt.part('table')?.shadowRoot?.querySelectorAll('tbody tr[data-pk-context]') ?? [])];

export default Base => class extends Base {
    connected() {
        if (this.$init) return;
        this.$init = true; this.$initial = this.value; this.$initialValues = [...(this.values ?? [])];
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
        this.part('chips').addEventListener('pk-remove', e => { e.stopPropagation(); this.removeKey(e.detail.value); focusTrigger(this.part('control')); });
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
        // Single: a row click picks. Multiple: a checkbox column (selection survives paging and search; no select-all across pages) and the popup stays open.
        if (this.multiple) { dt.selectable = true; dt.selectPageOnly = true; dt.clickable = false; dt.addEventListener('pk-select', e => { e.stopPropagation(); this.choose(e.detail.selected.map(String)); }); }
        else dt.clickable = true;
        dt.load = async (q, o) => {
            this.say('Loading');
            try {
                const r = await this.load?.(q, o);
                // Every row seen names its key, so a chip of a row from another page keeps its label without a refetch.
                for (const row of r?.rows ?? []) this.labels.set(String(row[this.rowKey]), labelOf(row, this.labelKey, this.rowKey));
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
    // The multiple selection changed (a row ticked or unticked, a chip removed): keep it within max, raise the events, say what happened.
    choose(next) {
        const { values, refused } = limitSelection(this.values ?? [], next, this.max);
        if (refused) { this.say(`Limit of ${this.max} reached`); if (this.$dt) this.$dt.selected = [...values]; this.requestUpdate(); return; }
        this.values = values;
        for (const t of ['input', 'change']) this.dispatchEvent(new Event(t, { bubbles: true, composed: true }));
        this.emit('pk-values-change', { values: [...values], labels: values.map(v => this.labelFor(v)) });
    }
    removeKey(key) { const was = this.values ?? []; this.choose(was.filter(v => v !== key)); this.say(`Removed ${this.labelFor(key)}`); }
    // The chips of a multiple picker, one pk-tag per key, in a labelled list beside the field.
    drawChips() {
        const box = this.part('chips'), keys = this.multiple ? this.values ?? [] : [];
        box.hidden = keys.length === 0;
        const sig = keys.map(k => `${k}\u0000${this.labelFor(k)}`).join('\u0001') + this.disabled;
        if (sig === this.$chips) return;
        this.$chips = sig;
        box.replaceChildren(...keys.map(k => { const t = this.ownerDocument.createElement('pk-tag'); t.setAttribute('role', 'listitem'); t.toggleAttribute('controlled', true); t.toggleAttribute('removable', !this.disabled && !this.readonly); t.setAttribute('value', k); t.textContent = this.labelFor(k); return t; }));
        if (keys.length) loadElements(this.shadowRoot);
    }
    // The label for the current value: one picked in this session, one the host supplied, else what resolve(keys) answers (the key meanwhile is not shown).
    labelFor(value) {
        if (value === '') return '';
        const label = this.labels.get(value) ?? this.selectedLabels?.[value];
        if (label !== undefined) return label;
        if (typeof this.resolve !== 'function') return value;
        // Keys seen in one update go to one resolve([...]) call, each key asked once.
        if (!(this.$asked ??= new Set()).has(value)) {
            this.$asked.add(value);
            if (!(this.$batch ??= []).length) Promise.resolve().then(() => {
                const keys = this.$batch.splice(0);
                return Promise.resolve().then(() => this.resolve(keys)).then(r => { for (const [k, v] of Object.entries(labelMap(r))) this.labels.set(k, v); this.requestUpdate(); }, error => { for (const k of keys) this.$asked.delete(k); this.warnOnce(`resolve() rejected: ${error?.message ?? error}`); });
            });
            this.$batch.push(value);
        }
        return '';
    }
    updated() {
        const pop = this.part('popover'), btn = this.part('control'), text = this.part('text');
        const keys = this.multiple ? this.values ?? [] : [], shown = this.multiple ? (keys.length ? `${keys.length} selected` : '') : this.labelFor(this.value);
        text.textContent = shown || this.placeholder;
        text.toggleAttribute('data-placeholder', !shown);
        btn.label = [this.label, shown || this.placeholder].filter(Boolean).join(': ');
        this.drawChips();
        btn.toggleAttribute('aria-invalid', !!this.invalid);
        if (pop.open !== undefined && pop.open !== !!this.open) pop.open = !!this.open;
        if (this.open) {
            const dt = this.ensureTable();
            dt.rowKey = this.rowKey;
            if (this.multiple) { if (JSON.stringify(dt.selected) !== JSON.stringify(keys)) dt.selected = [...keys]; } else dt.currentRow = this.value;
            // config is handed over only when it changed: setting it makes the table load again.
            const cfg = { searchLabel: `Search ${this.label || 'options'}`, label: this.label, ...this.config }, key = JSON.stringify(cfg);
            if (key !== this.$cfg) { this.$cfg = key; dt.config = cfg; }
        } else this.$wantFocus = false;
        const empty = this.multiple ? keys.length === 0 : this.value === '';
        this.setValidity(this.required && empty ? { valueMissing: true } : {}, this.multiple ? 'Choose at least one option.' : 'Choose an option.', btn);
        if (this.multiple) { const fd = new FormData(); for (const k of keys) fd.append(this.name, k); this.setFormValue(fd); } else this.setFormValue(this.value);
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
    onReset() { this.value = this.$initial ?? ''; this.values = [...(this.$initialValues ?? [])]; this.$asked = null; }
    onRestore(state) { this.value = state ?? ''; }
    focus(o) { this.part('control').focus(o); }
};
