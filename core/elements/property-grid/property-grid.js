import { loadElements } from '../../js/loader.js';

// The same field vocabulary as pk-settings-page ({ key, type, label, options?, min?, max?, step?, required? }), so a property inspector and a settings form
// describe their fields alike; here the fields sit in collapsible groups and a change is announced per property (pk-property-change) instead of saved as a whole.
const CONTROL = { text: 'pk-input', number: 'pk-input', color: 'pk-input', unit: 'pk-input', select: 'pk-select', switch: 'pk-switch', range: 'pk-range' };
const HEX = /^#[0-9a-f]{6}$/i;
const empty = v => v === undefined || v === null || v === '';
const num = c => (c.value === '' || c.value == null ? '' : Number(c.value));
// A unit property's value is { value, unit } (the number and the chosen unit); every other type is a plain value.
const read = ({ f, c, unit }) => (f.type === 'switch' ? c.checked : f.type === 'unit' ? { value: num(c), unit: unit.value } : f.type === 'number' || f.type === 'range' ? num(c) : c.value);
const write = ({ f, c, unit }, v) => {
    if (f.type === 'switch') c.checked = Boolean(v);
    else if (f.type === 'unit') { c.value = v?.value ?? ''; unit.value = v?.unit || f.units[0]; }
    else c.value = v ?? '';
};

// The built-in rules (required, number range); returns the message or ''. Host-side rules arrive through the errors property.
function check(f, v) {
    const name = f.label ?? f.key;
    const u = f.type === 'unit';
    const n = u ? v?.value : v;
    if (f.required && empty(n)) return `${name} is required.`;
    if ((f.type === 'number' || u) && !empty(n)) {
        const sfx = u ? ` ${v.unit}` : '';
        if (!Number.isFinite(Number(n))) return `${name} must be a number.`;
        if (f.min !== undefined && Number(n) < f.min) return `${name} must be at least ${f.min}${sfx}.`;
        if (f.max !== undefined && Number(n) > f.max) return `${name} must be at most ${f.max}${sfx}.`;
    }
    if (f.type === 'color' && !empty(v) && !HEX.test(v)) return `${name} must be a colour like #1a2b3c.`;
    return '';
}

// visibleWhen: { key, equals } or { key, in: [...] } against the current values; no rule means always visible.
const visible = (f, values) => !f.visibleWhen || ('in' in f.visibleWhen ? f.visibleWhen.in.includes(values[f.visibleWhen.key]) : values[f.visibleWhen.key] === f.visibleWhen.equals);

function buildField(doc, f) {
    if (f.type === 'unit' && !f.units?.length) f = { ...f, units: ['px'] };
    const tag = CONTROL[f.type] ?? 'pk-input';
    const c = doc.createElement(tag);
    const msg = doc.createElement('pk-alert');
    msg.kind = 'danger'; msg.plain = true; msg.inline = true; msg.compact = true; msg.hidden = true;
    if (f.disabled) c.disabled = true;
    if (tag === 'pk-switch') { c.textContent = f.label ?? f.key; return { c, msg, row: c, f }; }
    if (f.required) c.required = true;
    let swatch, unit;
    if (tag === 'pk-input') {
        c.type = f.type === 'number' || f.type === 'unit' ? 'number' : 'text';
        if (f.type === 'number' || f.type === 'unit') { c.stepper = true; for (const k of ['min', 'max', 'step']) if (f[k] !== undefined) c[k] = f[k]; }
        if (f.type === 'unit') {
            // The unit picker is a pk-select in the input's suffix slot, named after the property so it is not an unlabelled control.
            unit = doc.createElement('pk-select'); unit.slot = 'suffix'; unit.label = `${f.label ?? f.key} unit`;
            for (const x of f.units) { const opt = doc.createElement('option'); opt.value = opt.textContent = String(x); unit.append(opt); }
            c.append(unit);
        }
        if (f.type === 'color') { c.placeholder = '#rrggbb'; swatch = doc.createElement('span'); swatch.slot = 'prefix'; swatch.className = 'swatch'; c.append(swatch); }
    } else if (tag === 'pk-range') {
        for (const k of ['min', 'max', 'step']) if (f[k] !== undefined) c[k] = f[k];
        c.output = true;
    } else for (const o of f.options ?? []) { const opt = doc.createElement('option'); opt.value = String(o.value ?? o); opt.textContent = o.label ?? String(o); c.append(opt); }
    // Every non-switch control sits in a pk-field, which draws the label (above, or beside the value in the wide layout) and names the control.
    const field = doc.createElement('pk-field');
    field.label = f.label ?? f.key;
    field.append(c);
    return { c, msg, row: field, swatch, unit, f };
}

export default Base => class extends Base {
    connected() {
        if (this.$w) return;
        this.$w = true;
        loadElements(this.shadowRoot);
        for (const type of ['pk-value-change', 'pk-change', 'pk-range']) this.part('groups').addEventListener(type, e => this.onChange(e));
        // Two columns (label beside value) once the grid itself is wide; stacked otherwise. Follows the grid's own width, not the viewport.
        if (typeof ResizeObserver === 'function') {
            this.$ro = new ResizeObserver(([e]) => this.layout(e.contentRect.width >= 480));
            this.$ro.observe(this);
        }
        this.build();
    }
    disconnected() { this.$ro?.disconnect(); }
    layout(wide) {
        if (wide === this.$wide) return;
        this.$wide = wide;
        for (const r of Object.values(this.$rows ?? {})) if (r.row !== r.c) r.row.layout = wide ? 'row' : 'stack';
    }
    changed(name) { if (name === 'config') this.build(); else if (name === 'values') this.applyValues(); else if (name === 'errors' || name === 'disabled' || name === 'state') this.paint(); }
    // Sets one property from outside without rebuilding: focus, scroll and open groups stay as they are.
    setValue(key, value) {
        const r = this.$rows?.[key];
        if (!r) return;
        write(r, value);
        this.paint();
    }

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
                const { c, msg, row, swatch, unit, f: built } = buildField(doc, f);
                stack.append(row, msg);
                this.$rows[f.key] = { f: built, c, msg, row, swatch, unit };
                if (this.$wide && row !== c) row.layout = 'row';
            }
            item.append(stack);
            box.append(item);
        }
        loadElements(box);
        this.applyValues();
    }
    currentValues() {
        const out = {};
        for (const [key, r] of Object.entries(this.$rows ?? {})) out[key] = read(r);
        return out;
    }
    applyValues() {
        for (const [key, r] of Object.entries(this.$rows ?? {})) if (Object.hasOwn(this.values ?? {}, key)) write(r, this.values[key]);
        this.paint();
    }
    isHidden(key, values) {
        const { f } = this.$rows[key];
        return this.state?.[key]?.hidden ?? (Boolean(f.hidden) || !visible(f, values));
    }
    errorFor(key) {
        const r = this.$rows[key];
        return this.errors?.[key] || check(r.f, read(r));
    }
    get valid() { const v = this.currentValues(); return Object.keys(this.$rows ?? {}).every(k => this.isHidden(k, v) || !this.errorFor(k)); }
    paint() {
        const values = this.currentValues();
        for (const [key, r] of Object.entries(this.$rows ?? {})) {
            const { f, c, msg } = r;
            const hidden = this.isHidden(key, values);
            const err = hidden ? '' : this.errorFor(key);
            r.row.hidden = hidden;
            c.invalid = Boolean(err);
            msg.hidden = !err;
            msg.textContent = err;
            c.disabled = Boolean(f.disabled || this.state?.[key]?.disabled || this.disabled);
            if (r.unit) r.unit.disabled = c.disabled;
            if (r.swatch?.style) r.swatch.style.background = HEX.test(values[key]) ? values[key] : 'transparent';
        }
    }
    onChange(e) {
        const hit = Object.entries(this.$rows ?? {}).find(([, r]) => r.c === e.target || r.unit === e.target);
        if (!hit) return;
        this.paint();
        const values = this.currentValues();
        this.emit('pk-property-change', { key: hit[0], value: values[hit[0]], values, valid: this.valid });
    }
};
