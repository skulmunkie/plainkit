// pk-field-group behaviour (see meta.json): draws a pk-field + control per field spec in this element's own shadow tree, keeps the values, raises pk-change, and
// shows or hides conditional fields. A field that is not shown is not in the tree at all, so it takes no part in validation (#226). The kind table, the commit
// events and the `when` rules are js/field-kinds.js, shared with js/page-fields.js.
import { loadElements } from '../../js/loader.js';
import { controlTag, commitOf, readValue, writeValue, controlAttrs, messageAttrs, isVisible, isChecked } from '../../js/field-kinds.js';

// The same value, as the text the controls show.
const same = (a, b) => String(a ?? '') === String(b ?? '');

export default Base => class extends Base {
    connected() {
        if (this.$w) return;
        this.$w = true;
        this.$rows = new Map();
        this.$vals = { ...(this.values ?? {}) };
        this.reconcile();
    }
    changed(name) {
        if (!this.$w) return;
        if (name === 'values') { if (!this.$own) { this.$vals = { ...(this.values ?? {}) }; this.reconcile(); } }
        else if (name === 'fields') { for (const row of this.$rows.values()) row.field.remove(); this.$rows.clear(); this.reconcile(); }
        else if (name === 'disabled' || name === 'readonly') this.syncState();
        else if (name === 'label') this.aria({ role: 'group', ariaLabel: this.label || null });
    }
    updated() { this.aria({ role: 'group', ariaLabel: this.label || null }); }

    // Draws every field that shows, in order, removes the ones that no longer do, and writes any value that differs into its control.
    reconcile() {
        const doc = this.ownerDocument, group = this.part('group'), specs = Array.isArray(this.fields) ? this.fields : [];
        const shown = [];
        let built = false;
        for (const spec of specs) {
            if (!spec?.key) continue;
            const seen = isVisible(spec, this.$vals, this.visible);
            let row = this.$rows.get(spec.key);
            if (!seen) { if (row) { row.field.remove(); this.$rows.delete(spec.key); } continue; }
            if (!row) { row = this.build(doc, spec); built = true; }
            else if (!same(readValue(row.control, row.kind), this.$vals[spec.key] ?? (isChecked(row.kind) ? false : ''))) writeValue(row.control, row.kind, this.$vals[spec.key]);
            shown.push(row.field);
        }
        group.append(...shown); // append moves an attached node, so this also keeps the order
        this.syncState();
        if (built) loadElements(this.shadowRoot);
    }
    /** Draws the fields again: call it after changing the visible(spec, values) callback property, which nothing watches. */
    refresh() { this.reconcile(); }
    build(doc, spec) {
        const kind = spec.kind ?? 'text', tag = controlTag(kind);
        const control = doc.createElement(tag), field = doc.createElement('pk-field');
        const put = (el, attrs) => { for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); };
        put(control, { ...controlAttrs(spec), ...messageAttrs(spec) });
        if (kind === 'switch') control.textContent = spec.label ?? spec.key;
        if (kind === 'select') control.options = spec.options ?? [];
        if (kind === 'combobox') for (const o of spec.options ?? []) { const opt = doc.createElement('option'); opt.value = o.value; opt.textContent = o.label ?? o.value; control.append(opt); }
        if (kind === 'switch') { /* the switch's own text is its label */ } else if (spec.hideLabel) control.setAttribute('aria-label', spec.label ?? spec.key); else field.setAttribute('label', spec.label ?? spec.key);
        if (spec.hint) field.setAttribute('help', spec.hint);
        if (spec.required) field.setAttribute('required', '');
        if (spec.span) field.setAttribute('data-span', '');
        field.append(control);
        if (spec.help) { const tip = doc.createElement('pk-tooltip'); tip.setAttribute('slot', 'label-action'); tip.setAttribute('help', ''); tip.setAttribute('interactive', ''); tip.setAttribute('text', spec.help); field.append(tip); }
        const slot = doc.createElement('slot'); slot.setAttribute('name', `label-action-${spec.key}`); slot.setAttribute('slot', 'label-action'); field.append(slot);
        const commit = commitOf(kind), row = { spec, kind, field, control };
        control.addEventListener(commit.event, e => {
            if (e.target !== control) return;
            e.stopPropagation(); // the control's own commit event (pk-change of a checkbox, pk-value-change) is not this element's: only pk-change below leaves
            this.$vals = { ...this.$vals, [spec.key]: commit.read(e) };
            this.$own = true; this.values = this.$vals; this.$own = false;
            this.emit('pk-change', { key: spec.key, value: this.$vals[spec.key], values: { ...this.$vals } });
            this.reconcile();
        });
        writeValue(control, kind, this.$vals[spec.key]); // before the control is upgraded this is its own property, adopted when it upgrades
        this.$rows.set(spec.key, row);
        return row;
    }
    syncState() {
        for (const { spec, control } of this.$rows.values()) {
            control.toggleAttribute('disabled', Boolean(this.disabled || spec.disabled));
            control.toggleAttribute('readonly', Boolean(this.readonly || spec.readonly));
        }
    }
};
