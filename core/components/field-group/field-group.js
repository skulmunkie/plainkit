// pk-field-group behaviour (see meta.json): draws a pk-field + control per field spec in this element's own shadow tree, keeps the values, raises pk-change, and
// shows or hides conditional fields. A field that is not shown is not in the tree at all, so it takes no part in validation (#226). The kind table, the commit
// events, the `when` rules and the form entries are js/field-kinds.js, shared with js/page-fields.js.
// The element is form-associated: its form value is a FormData with one entry per shown field, its validity is the first invalid control's (anchored on it, so
// the browser focuses the right field), and it answers the small protocol pk-form uses to look through it: problems(), report(on), checkField(key), focus().
import { loadElements } from '../../js/loader.js';
import { controlTag, commitOf, readValue, writeValue, controlAttrs, messageAttrs, isVisible, isChecked, formEntries, valuesFromEntries } from '../../js/field-kinds.js';
import { messageFor } from '../../js/validation.js';

// The same value, as the text the controls show.
const same = (a, b) => String(a ?? '') === String(b ?? '');

export default Base => class extends Base {
    connected() {
        if (this.$w) return;
        this.$w = true;
        this.$rows = new Map();
        this.$base = { ...(this.values ?? {}) }; // what a form reset goes back to: the values the host last gave
        this.$vals = { ...this.$base };
        const group = this.part('group');
        for (const type of ['input', 'change']) group.addEventListener(type, () => this.sync());
        // A failed submit or reportValidity() raises `invalid` on this element, which is not itself focusable: focus goes to the first invalid control.
        this.addEventListener('invalid', () => this.focus());
        this.reconcile();
    }
    changed(name) {
        if (!this.$w) return;
        if (name === 'values') { if (!this.$own) { this.$base = { ...(this.values ?? {}) }; this.$vals = { ...this.$base }; this.reconcile(); } }
        else if (name === 'fields') { for (const row of this.$rows.values()) row.field.remove(); this.$rows.clear(); this.reconcile(); }
        else if (name === 'disabled' || name === 'readonly') { this.syncState(); this.sync(); }
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
        if (built) loadElements(this.shadowRoot).then(() => this.sync());
        this.sync();
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

    // ---- form association --------------------------------------------------------------------------------------------------------------------
    // The form value is a FormData with one entry per shown field (js/field-kinds.js formEntries); the validity is the first invalid control's message, anchored on it.
    sync() {
        if (!this.$w) return;
        const rows = [...this.$rows.values()];
        const fd = new FormData();
        for (const [name, v] of formEntries(rows.map(r => ({ key: r.spec.key, kind: r.kind, value: readValue(r.control, r.kind), disabled: this.disabled || r.spec.disabled })), this.prefix ? this.name : '')) fd.append(name, v);
        this.setFormValue(fd, fd);
        const bad = this.invalidRows()[0];
        if (bad) this.setValidity({ customError: true }, messageFor(bad.control), bad.control); else this.setValidity({});
    }
    invalidRows() { return [...this.$rows.values()].filter(r => r.control.validity && r.control.validity.valid === false && r.control.willValidate !== false); }
    // pk-form's protocol: every problem in order, show or clear the messages in the fields, re-check one field, and focus the first problem.
    problems() { return this.invalidRows().map(r => ({ key: r.spec.key, label: r.spec.label ?? r.spec.key, message: messageFor(r.control), control: r.control, focus: () => r.control.focus() })); }
    report(on = true) {
        const bad = this.invalidRows();
        for (const r of this.$rows.values()) r.field.error = on && bad.includes(r) ? messageFor(r.control) : '';
    }
    checkField(which) {
        const r = typeof which === 'string' ? this.$rows.get(which) : [...this.$rows.values()].find(x => x.control === which || x.field.contains?.(which));
        if (!r) return true;
        const message = r.control.validity?.valid === false ? messageFor(r.control) : '';
        r.field.error = message;
        return message === '';
    }
    focusField(key) { this.$rows.get(key)?.control.focus(); }
    focus(options) { (this.invalidRows()[0] ?? [...this.$rows.values()][0])?.control.focus(options); }
    onReset() {
        this.$vals = { ...this.$base };
        this.$own = true; this.values = { ...this.$base }; this.$own = false;
        this.reconcile();
        this.report(false);
    }
    onRestore(state) {
        if (!(state instanceof FormData)) return;
        const saved = valuesFromEntries([...state.entries()], this.prefix ? this.name : '');
        const next = { ...this.$vals };
        for (const spec of Array.isArray(this.fields) ? this.fields : []) if (spec?.key) next[spec.key] = isChecked(spec.kind) ? spec.key in saved : saved[spec.key] ?? next[spec.key];
        this.$vals = next;
        this.$own = true; this.values = next; this.$own = false;
        this.reconcile();
    }
};
