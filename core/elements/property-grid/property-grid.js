import { loadElements } from '../../js/loader.js';

// The same field vocabulary as pk-settings-page ({ key, type, label, options?, min?, max?, step?, required? }), so a property inspector and a settings form
// describe their fields alike; here the fields sit in collapsible groups and a change is announced per property (pk-property-change) instead of saved as a whole.
const CONTROL = { text: 'pk-input', number: 'pk-input', select: 'pk-select', switch: 'pk-switch' };
const empty = v => v === undefined || v === null || v === '';
const read = (c, type) => (type === 'switch' ? c.checked : type === 'number' ? (c.value === '' || c.value == null ? '' : Number(c.value)) : c.value);
const write = (c, type, v) => { if (type === 'switch') c.checked = Boolean(v); else c.value = v ?? ''; };

// The built-in rules (required, number range); returns the message or ''. Host-side rules arrive through the errors property.
function check(f, v) {
    const name = f.label ?? f.key;
    if (f.required && empty(v)) return `${name} is required.`;
    if (f.type === 'number' && !empty(v)) {
        if (!Number.isFinite(Number(v))) return `${name} must be a number.`;
        if (f.min !== undefined && Number(v) < f.min) return `${name} must be at least ${f.min}.`;
        if (f.max !== undefined && Number(v) > f.max) return `${name} must be at most ${f.max}.`;
    }
    return '';
}

function buildField(doc, f) {
    const tag = CONTROL[f.type] ?? 'pk-input';
    const c = doc.createElement(tag);
    if (tag === 'pk-switch') c.textContent = f.label ?? f.key;
    else {
        c.label = f.label ?? f.key;
        c.showLabel = true;
        if (f.required) c.required = true;
        if (tag === 'pk-input') {
            c.type = f.type === 'number' ? 'number' : 'text';
            if (f.type === 'number') { c.stepper = true; for (const k of ['min', 'max', 'step']) if (f[k] !== undefined) c[k] = f[k]; }
        } else for (const o of f.options ?? []) { const opt = doc.createElement('option'); opt.value = String(o.value ?? o); opt.textContent = o.label ?? String(o); c.append(opt); }
    }
    if (f.disabled) c.disabled = true;
    const msg = doc.createElement('pk-alert');
    msg.kind = 'danger'; msg.plain = true; msg.inline = true; msg.compact = true; msg.hidden = true;
    // pk-select has no visible label of its own (its label prop is the accessible name), so a pk-field draws it, as pk-settings-page does for pk-range.
    if (tag !== 'pk-select') return { c, msg, row: c };
    const field = doc.createElement('pk-field');
    field.label = f.label ?? f.key;
    field.append(c);
    return { c, msg, row: field };
}

export default Base => class extends Base {
    connected() {
        if (this.$w) return;
        this.$w = true;
        loadElements(this.shadowRoot);
        for (const type of ['pk-value-change', 'pk-change']) this.part('groups').addEventListener(type, e => this.onChange(e));
        this.build();
    }
    changed(name) { if (name === 'config') this.build(); else if (name === 'values') this.applyValues(); else if (name === 'errors' || name === 'disabled') this.paint(); }

    // Rebuilt only when config.groups itself changes, so a re-render never wipes what was just edited.
    build() {
        const key = JSON.stringify(this.config?.groups ?? []);
        if (key === this.$builtFor) return;
        this.$builtFor = key;
        const doc = this.ownerDocument;
        const box = this.part('groups');
        box.replaceChildren();
        this.$rows = {};
        const groups = this.config?.groups ?? [];
        this.part('empty').hidden = groups.length !== 0;
        for (const g of groups) {
            const item = doc.createElement('pk-accordion-item');
            item.heading = g.heading ?? '';
            item.open = !g.collapsed;
            const stack = doc.createElement('pk-stack');
            for (const f of g.fields ?? []) {
                const { c, msg, row } = buildField(doc, f);
                stack.append(row, msg);
                this.$rows[f.key] = { f, c, msg };
            }
            item.append(stack);
            box.append(item);
        }
        loadElements(box);
        this.applyValues();
    }
    currentValues() {
        const out = {};
        for (const [key, { f, c }] of Object.entries(this.$rows ?? {})) out[key] = read(c, f.type);
        return out;
    }
    applyValues() {
        for (const [key, { f, c }] of Object.entries(this.$rows ?? {})) if (Object.hasOwn(this.values ?? {}, key)) write(c, f.type, this.values[key]);
        this.paint();
    }
    errorFor(key) {
        const { f, c } = this.$rows[key];
        return this.errors?.[key] || check(f, read(c, f.type));
    }
    get valid() { return Object.keys(this.$rows ?? {}).every(k => !this.errorFor(k)); }
    paint() {
        for (const [key, { f, c, msg }] of Object.entries(this.$rows ?? {})) {
            const err = this.errorFor(key);
            c.invalid = Boolean(err);
            msg.hidden = !err;
            msg.textContent = err;
            if (!f.disabled) c.disabled = Boolean(this.disabled);
        }
    }
    onChange(e) {
        const hit = Object.entries(this.$rows ?? {}).find(([, r]) => r.c === e.target);
        if (!hit) return;
        this.paint();
        const values = this.currentValues();
        this.emit('pk-property-change', { key: hit[0], value: values[hit[0]], values, valid: this.valid });
    }
};
