// pk-field-group behaviour (see meta.json): draws a pk-field + control per field spec in this element's own shadow tree, keeps the values, raises pk-field-change, and
// shows or hides conditional fields. A field that is not shown is not in the tree at all, so it takes no part in validation (#226). The kind table, the commit
// events, the `when` rules and the form entries are js/field-kinds.js, shared with js/page-fields.js.
// The element is form-associated: its form value is a FormData with one entry per shown field, its validity is the first invalid control's (anchored on it, so
// the browser focuses the right field), and it answers the small protocol pk-form uses to look through it: problems(), report(on), checkField(key), focus().
import { loadElements } from '../../js/loader.js';
import { resolveSpec, controlTag, commitOf, readValue, writeValue, controlAttrs, messageAttrs, isVisible, isChecked, formEntries, valuesFromEntries } from '../../js/field-kinds.js';
import { messageFor } from '../../js/validation.js';

// The same value, as the text the controls show.
const EXPR = ['whenExpr', 'disabledExpr', 'readonlyExpr', 'requiredExpr', 'labelWhenExpr', 'helpWhenExpr'];
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
        // Enter in a text control commits what was typed first, as leaving the field would: a form that submits on Enter (pk-record-form, #1365) then sees the typed value, not the last committed one.
        group.addEventListener('keydown', e => { const t = e.composedPath()[0]; if (e.key === 'Enter' && !e.isComposing && t?.matches?.('input:not([type=checkbox],[type=radio],[type=button],[type=range])')) t.dispatchEvent(new Event('change', { bubbles: true, composed: true })); });
        // A failed submit or reportValidity() raises `invalid` on this element, which is not itself focusable: focus goes to the first invalid control.
        this.addEventListener('invalid', () => this.focus());
        this.reconcile();
    }
    changed(name) {
        if (!this.$w) return;
        if (name === 'values') { if (!this.$own) { this.$base = { ...(this.values ?? {}) }; this.$vals = { ...this.$base }; this.reconcile(); this.recheck(); } }
        else if (name === 'fields' && this.$patching) this.patchRows();
        else if (name === 'fields' || name === 'columns') { for (const row of this.$rows.values()) row.field.remove(); this.$rows.clear(); this.reconcile(); }
        else if (name === 'disabled' || name === 'readonly') { this.syncState(); this.sync(); }
        else if (name === 'label') this.aria({ role: 'group', ariaLabel: this.label || null });
    }
    // Replaces the specs without rebuilding the fields that stay (#1641): a record page whose conditions follow the edits sends new disabled, readonly, label and help for the same keys, and the control the user is in keeps its focus and its text; fields that left are removed, new ones drawn.
    patch(fields) { this.$patching = true; this.fields = fields; this.$patching = false; }
    drop(key, row) { row.field.remove(); this.$rows.delete(key); }
    patchRows() {
        const next = new Map(this.fields.map(f => [f?.key, f]));
        this.$vals = this.snapshot(); // text typed but not committed yet stays in its control: reconcile would write the committed value over it
        for (const [key, row] of [...this.$rows]) { if (next.has(key)) row.spec = resolveSpec(next.get(key)); else this.drop(key, row); }
        this.reconcile();
    }
    updated() { this.aria({ role: 'group', ariaLabel: this.label || null }); }

    // Draws every field that shows, in order, removes the ones that no longer do, and writes any value that differs into its control.
    reconcile() {
        const doc = this.ownerDocument, group = this.part('group'), specs = Array.isArray(this.fields) ? this.fields : [];
        const shown = [];
        let built = false;
        const mod = this.conditions(specs);
        for (const spec of specs) {
            if (!spec?.key) continue;
            const seen = isVisible(spec, this.$vals, this.visible) && this.test(spec, 'whenExpr', mod) !== false;
            let row = this.$rows.get(spec.key);
            if (!seen) { if (row) this.drop(spec.key, row); continue; }
            if (!row) { row = this.build(doc, spec); built = true; }
            else if (row.control && !same(readValue(row.control, row.kind), this.$vals[spec.key] ?? (isChecked(row.kind) ? false : ''))) writeValue(row.control, row.kind, this.$vals[spec.key]);
            shown.push(row.field);
        }
        // Moving a node takes focus out of it (a blur that a form would check), so the fields are only appended when their order is not already right.
        shown.forEach((f, i) => { if (group.children[i] !== f) group.insertBefore(f, group.children[i] ?? null); }); // only a field that is out of place moves, so the control being typed in keeps its focus
        group.toggleAttribute('data-twelve', shown.some(f => f.hasAttribute('data-cols')));
        this.syncState();
        if (built) loadElements(this.shadowRoot).then(() => this.sync());
        this.sync();
    }
    // Declarative conditions (#1282): a spec's whenExpr/disabledExpr/readonlyExpr/requiredExpr (or `when` as a string) are run by js/field-conditions.js, which is loaded
    // only once a spec declares one. Until it is loaded a field with a whenExpr is not drawn and the other conditions read as false; the load draws the fields again.
    conditions(specs) {
        if (this.$cond || this.$condLoad || !specs.some(s => s && (typeof s.when === 'string' || EXPR.some(k => typeof s[k] === 'string')))) return this.$cond;
        this.$condLoad = import('../../js/field-conditions.js').then(m => { this.$cond = m; if (this.isConnected) this.reconcile(); }, e => this.log.error('field-conditions failed', e));
        return undefined;
    }
    // The keys a condition may name: this group's fields and every value the host gave, so a page of several groups (pk-record-page's cards) can condition a field on one that another card draws (#1600).
    known() { return new Set([...(Array.isArray(this.fields) ? this.fields : []).map(f => f?.key), ...Object.keys(this.$vals ?? {})]); }
    // One condition of a spec against the committed values: undefined when the spec declares none, false while the module is not loaded, else the answer
    // (an unknown field or a syntax error is warned once and reads as true for whenExpr, false for the rest).
    test(spec, name, mod) {
        const src = name === 'whenExpr' && typeof spec.when === 'string' ? spec.when : spec[name];
        if (typeof src !== 'string') return undefined;
        if (!mod) return false;
        const known = this.known();
        return mod.evaluate(src, this.$vals, known, name === 'whenExpr', m => this.warnOnce(`cond:${spec.key}:${name}`, m));
    }
    // The label and the help tooltip of a field: the spec's own, or what labelWhenExpr / helpWhenExpr answer (conditional text, `cond ? 'text' : other`; an empty answer keeps the spec's own). Written on every reconcile (the first draw too), so a patched spec shows at once.
    texts(row, mod) {
        const { spec, kind, field, control } = row, known = this.known();
        const ask = name => (typeof spec[name] === 'string' && mod ? mod.evaluateText(spec[name], this.$vals, known, m => this.warnOnce(`cond:${spec.key}:${name}`, m)) : '');
        const label = ask('labelWhenExpr') || spec.label || spec.key, help = ask('helpWhenExpr') || spec.help || '';
        if (kind === 'switch') control.textContent = label; else if (kind !== 'custom' && spec.hideLabel) control.setAttribute('aria-label', label); else field.setAttribute('label', label);
        let tip = field.querySelector('pk-tooltip[help]');
        if (!help) tip?.remove();
        else if (tip) tip.setAttribute('text', help);
        else { tip = this.tip(help); (control ?? field.lastElementChild).after(tip); loadElements(this.shadowRoot); }
    }
    /** Draws the fields again: call it after changing the visible(spec, values) callback property, which nothing watches. */
    refresh() { this.reconcile(); }
    // `span` fills the row; `columnSpan` (2 or 3) takes that many columns of a multi-column group, and a span that reaches every column is the whole row.
    spanOf(field, spec) {
        const n = Math.floor(Number(spec.columnSpan));
        const c = Math.floor(Number(spec.cols)); // cols (1 to 12): the width on a 12-column grid, which the whole group then uses
        if (c >= 1 && c <= 12) { field.setAttribute('data-cols', c); field.style.setProperty('--c', c); field.toggleAttribute('data-wide', c >= 6); }
        else if (spec.span || n >= this.columns) field.setAttribute('data-span', '');
        else if (n > 1) field.setAttribute('data-span', n);
    }
    // The host's label-action-<key> content, on every kind (a custom field included); `labelActionEnd` pins it to the end of the label row.
    mk(tag, attrs) { const e = this.ownerDocument.createElement(tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }
    tip(text) { return this.mk('pk-tooltip', { slot: 'label-action', help: '', interactive: '', text }); }
    labelAction(field, spec) {
        field.append(this.mk('slot', { name: `label-action-${spec.key}`, slot: 'label-action' }));
        if (spec.labelActionEnd) field.setAttribute('action-end', '');
    }
    build(doc, raw) {
        const spec = resolveSpec(raw), kind =spec.kind ?? 'text', tag = controlTag(kind);
        if (kind === 'custom') return this.buildCustom(doc, spec);
        const control = doc.createElement(tag), field = doc.createElement('pk-field');
        const put = (el, attrs) => { for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); };
        put(control, { ...controlAttrs(spec), ...messageAttrs(spec) });
        if (kind === 'select') control.options = spec.options ?? [];
        if (kind === 'combobox') control.append(...this.opts(doc, spec.options));
        if (spec.hint) field.setAttribute('help', spec.hint);
        if (spec.required) field.setAttribute('required', '');
        this.spanOf(field, spec);
        field.append(control);
        this.labelAction(field, spec);
        const commit = commitOf(kind), row = { spec, kind, field, control };
        control.addEventListener(commit.event, e => {
            if (e.target !== control) return;
            e.stopPropagation(); // the control's own commit event (pk-change of a checkbox, pk-value-change) is not this element's: only pk-field-change below leaves
            this.$vals = { ...this.$vals, [spec.key]: commit.read(e) };
            this.own(this.$vals);
            if (typeof this.commit === 'function') return this.commitAsync(row);
            this.announce(spec.key);
        });
        if (kind === 'combobox') control.addEventListener('pk-combo-query', e => this.onQuery(row, e));
        writeValue(control, kind, this.$vals[spec.key]); // before the control is upgraded this is its own property, adopted when it upgrades
        this.$rows.set(spec.key, row);
        return row;
    }
    own(v) { this.$own = true; this.values = v; this.$own = false; } // a change the group made itself: `values` does not redraw
    announce(key) { this.emit('pk-field-change', { key, value: this.$vals[key], values: { ...this.$vals } }); this.reconcile(); }
    // With a commit({ key, value, values }) callback property the change is handed to the host first: the field is busy until it answers, a newer edit of the same field
    // supersedes an older pending one (last wins: a stale answer changes nothing), a rejection or a returned string is the field's error message (the typed text stays), and
    // pk-field-change is raised only once the host accepted the value.
    async commitAsync(row) {
        const n = row.c = (row.c ?? 0) + 1, key = row.spec.key, { control, field } = row, value = this.$vals[key];
        field.error = ''; control.setAttribute('aria-busy', 'true');
        if (!field.querySelector('[data-busy]')) { field.append(this.mk('pk-spinner', { size: 'sm', label: 'Saving', slot: 'label-action', 'data-busy': '' })); loadElements(this.shadowRoot); }
        let error = '';
        try { const answer = await this.commit({ key, value, values: { ...this.$vals } }); if (typeof answer === 'string') error = answer; } catch (e) { error = e?.message || 'The change could not be saved.'; this.log.warn(`commit for "${key}" failed`, e); }
        if (row.c !== n || this.$rows.get(key) !== row) return;
        control.removeAttribute('aria-busy'); field.querySelector('[data-busy]')?.remove();
        if (error) field.error = error; else this.announce(key);
    }
    // A custom field has no control: its body is the host's own content in the editor-<key> slot, with no value, no validation and no part in the form.
    buildCustom(doc, spec) {
        const field = doc.createElement('pk-field'), slot = this.mk('slot', { name: `editor-${spec.key}` }), row = { spec, kind: 'custom', field, control: null };
        if (spec.hint) field.setAttribute('help', spec.hint);
        this.spanOf(field, spec);
        field.append(slot);
        this.labelAction(field, spec);
        this.$rows.set(spec.key, row);
        return row;
    }
    // A combobox field with a search({ key, query }) callback property takes its options from the answer (a promise of [{ value, label }]) instead of filtering its own;
    // a newer query makes an older pending answer stale.
    opts(doc, list) { return (list ?? []).map(o => { const opt = doc.createElement('option'); opt.value = o.value; opt.textContent = o.label ?? o.value; return opt; }); }
    async onQuery(row, e) {
        if (typeof this.search !== 'function') return;
        e.stopPropagation();
        const n = row.q = (row.q ?? 0) + 1, key = row.spec.key;
        let options;
        try { options = await this.search({ key, query: e.detail.query }); } catch (error) { this.log.warn(`search for "${key}" failed`, error); return; }
        if (row.q !== n || this.$rows.get(key) !== row) return;
        row.control.replaceChildren(...this.opts(this.ownerDocument, options));
    }
    syncState() {
        const mod = this.$cond;
        for (const row of this.$rows.values()) {
            const { spec, kind, control } = row;
            this.texts(row, mod);
            if (!control) continue;
            row.off = Boolean(this.disabled || spec.disabled || this.test(spec, 'disabledExpr', mod));
            if (kind !== 'range' && typeof spec.requiredExpr === 'string') { const req = !!(spec.required || this.test(spec, 'requiredExpr', mod)); control.toggleAttribute('required', req); row.field.toggleAttribute('required', req); }
            if (kind === 'combobox') { if (typeof this.search === 'function') control.setAttribute('filtering', 'off'); else control.removeAttribute('filtering'); }
            control.toggleAttribute('disabled', row.off);
            control.toggleAttribute('readonly', !!(this.readonly || spec.readonly || this.test(spec, 'readonlyExpr', mod)));
        }
    }

    // ---- form association --------------------------------------------------------------------------------------------------------------------
    // The form value is a FormData with one entry per shown field (js/field-kinds.js formEntries); the validity is the first invalid control's message, anchored on it.
    // A control validates in its own update (a microtask), so the aggregate is read again one microtask later.
    sync() { this.syncNow(); queueMicrotask(() => this.syncNow()); }
    syncNow() {
        if (!this.$w) return;
        const rows = [...this.$rows.values()].filter(r => r.control);
        const fd = new FormData();
        for (const [name, v] of formEntries(rows.map(r => ({ key: r.spec.key, kind: r.kind, value: readValue(r.control, r.kind), disabled: r.off ?? (this.disabled || r.spec.disabled) })), this.prefix ? this.name : '')) fd.append(name, v);
        this.setFormValue(fd, fd);
        const bad = this.invalidRows()[0];
        if (bad) this.setValidity({ customError: true }, messageFor(bad.control), bad.control); else this.setValidity({});
    }
    invalidRows() { return [...this.$rows.values()].filter(r => r.control?.validity && r.control.validity.valid === false && r.control.willValidate !== false); }
    // pk-form's protocol: every problem in order, show or clear the messages in the fields, re-check one field, and focus the first problem.
    problems() { return this.invalidRows().map(r => ({ key: r.spec.key, label: r.spec.label ?? r.spec.key, message: messageFor(r.control), control: r.control, focus: () => r.control.focus() })); }
    report(on = true) {
        const bad = this.invalidRows();
        for (const r of this.$rows.values()) r.field.error = on && bad.includes(r) ? messageFor(r.control) : '';
    }
    rowOf(which) { return typeof which === 'string' ? this.$rows.get(which) : [...this.$rows.values()].find(x => x.control === which || x.field.contains?.(which)); }
    checkField(which) {
        const r = this.rowOf(which);
        if (!r) return true;
        const message = !r.control ? '' : r.control.validity?.valid === false ? messageFor(r.control) : '';
        r.field.error = message;
        return message === '';
    }
    // New values from the host: a message already showing is checked again against them once the controls have validated (a loaded record clears what the last one left).
    recheck() { queueMicrotask(() => queueMicrotask(() => { for (const [key, r] of this.$rows) if (r.field.error) this.checkField(key); })); }
    // Whether the field (by key, or the control or a node inside it) is showing a message now; pk-form asks before it re-checks while typing.
    showsError(which) {
        return !!this.rowOf(which)?.field.error;
    }
    // The live values of the shown fields as the controls hold them now (the committed values of the others stay as they were); a host reads these when the user has typed without committing.
    snapshot() { const out = { ...this.$vals }; for (const [k, r] of this.$rows) if (r.control) out[k] = readValue(r.control, r.kind); return out; }
    // Shows a message in one field (a server's answer); report(false) clears every message.
    setError(key, message) { const r = this.$rows.get(key); if (r) r.field.error = message ?? ''; }
    focusField(key) { this.$rows.get(key)?.control?.focus(); }
    focus(options) { (this.invalidRows()[0] ?? [...this.$rows.values()].find(r => r.control))?.control.focus(options); }
    onReset() {
        this.report(false);
        this.$vals = { ...this.$base };
        this.own({ ...this.$base });
        this.reconcile();
    }
    onRestore(state) {
        if (!(state instanceof FormData)) return;
        const saved = valuesFromEntries([...state.entries()], this.prefix ? this.name : '');
        const next = { ...this.$vals };
        for (const spec of Array.isArray(this.fields) ? this.fields : []) if (spec?.key) next[spec.key] = isChecked(spec.kind) ? spec.key in saved : saved[spec.key] ?? next[spec.key];
        this.$vals = next;
        this.own(next);
        this.reconcile();
    }
};
