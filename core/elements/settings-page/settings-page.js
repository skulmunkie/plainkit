import { loadElements } from '../../js/loader.js';

// Which control a field type builds, and how its value is read/written; pk-switch (checked) and pk-range (a pk-field wrapper, no label
// prop of its own) differ from the labelled scalar controls tool-page also uses (STANDARDS.md: only existing components).
const CONTROL = { text: 'pk-input', email: 'pk-input', number: 'pk-input', date: 'pk-input', textarea: 'pk-textarea', select: 'pk-select', switch: 'pk-switch', range: 'pk-range' };
const read = (el, type) => (type === 'switch' ? el.checked : el.value);
const write = (el, type, v) => { if (type === 'switch') el.checked = Boolean(v); else if (v !== undefined) el.value = v; };

function buildField(doc, f) {
    const tag = CONTROL[f.type] ?? 'pk-input';
    const el = doc.createElement(tag);
    if (tag === 'pk-switch') { el.textContent = f.label ?? f.key; return { el, row: el }; }
    if (tag === 'pk-range') {
        if (f.min !== undefined) el.min = f.min;
        if (f.max !== undefined) el.max = f.max;
        if (f.step !== undefined) el.step = f.step;
        el.output = true;
        const field = doc.createElement('pk-field');
        field.label = f.label ?? f.key;
        field.append(el);
        return { el, row: field };
    }
    el.label = f.label ?? f.key;
    el.showLabel = true;
    if (f.placeholder) el.placeholder = f.placeholder;
    if (f.required) el.required = true;
    if (tag === 'pk-input') el.type = f.type ?? 'text';
    if (tag === 'pk-select') for (const o of f.options ?? []) { const opt = doc.createElement('option'); opt.value = String(o.value ?? o); opt.textContent = o.label ?? String(o); el.append(opt); }
    return { el, row: el };
}

export default Base => class extends Base {
    connected() {
        if (this.$w) return;
        this.$w = true;
        // The bar, buttons and alerts are real pk-* elements in this shadow tree from the start; load them once here (core/elements/detail-layout
        // does the same for its own strip and Next button, and pk-tool-page for its Run button).
        loadElements(this.shadowRoot);
        this.part('form').addEventListener('submit', e => { e.preventDefault(); this.saveNow(); });
        for (const type of ['pk-value-change', 'pk-change', 'pk-range']) this.part('form').addEventListener(type, () => this.paint());
        this.part('discard').addEventListener('click', () => this.discard());
        this.buildSections();
    }
    changed(name) { if (name === 'config') this.buildSections(); else if (name === 'values') this.applyValues(); }

    // Rebuilt only when config.sections itself changes (a JSON prop, so a cheap string compare is the dirty check): every other prop change
    // must never wipe what the reader already typed into a field.
    buildSections() {
        const key = JSON.stringify(this.config?.sections ?? []);
        if (key === this.$builtFor) return;
        this.$builtFor = key;
        const doc = this.ownerDocument;
        const box = this.part('sections');
        box.replaceChildren();
        this.$controls = {};
        const sections = this.config?.sections ?? [];
        this.part('empty').hidden = sections.length !== 0;
        for (const section of sections) {
            const card = doc.createElement('pk-card');
            if (section.heading) card.heading = section.heading;
            const stack = doc.createElement('pk-stack');
            for (const f of section.fields ?? []) {
                const { el, row } = buildField(doc, f);
                stack.append(row);
                this.$controls[f.key] = { el, type: f.type };
            }
            card.append(stack);
            box.append(card);
        }
        loadElements(box);
        this.applyValues();
    }
    currentValues() {
        const out = {};
        for (const [key, { el, type }] of Object.entries(this.$controls ?? {})) out[key] = read(el, type);
        return out;
    }
    // Writes the host's values property into the built controls and takes a fresh baseline: called after a rebuild, and again whenever the
    // host sets a new values object (e.g. once ctx.store's own settings finish loading).
    applyValues() {
        for (const [key, { el, type }] of Object.entries(this.$controls ?? {})) if (Object.hasOwn(this.values ?? {}, key)) write(el, type, this.values[key]);
        this.$base = this.currentValues();
        this.paint();
    }
    discard() {
        for (const [key, { el, type }] of Object.entries(this.$controls ?? {})) write(el, type, this.$base?.[key]);
        this.paint();
    }
    paint() {
        this.part('saved').hidden = true;
        const dirty = JSON.stringify(this.currentValues()) !== JSON.stringify(this.$base ?? {});
        this.part('bar').hidden = !dirty;
        if (dirty) { const status = this.part('status'); status.kind = 'warning'; status.textContent = 'Unsaved changes'; }
    }
    // The host's save(values) is a callback property (STANDARDS.md: config is data, callbacks are set from script), never a config key -
    // the same shape as pk-tool-page's run.
    async saveNow() {
        if (typeof this.save !== 'function') return;
        const status = this.part('status');
        const btn = this.part('save');
        btn.disabled = true;
        try {
            await this.save(this.currentValues());
            this.$base = this.currentValues();
            this.part('bar').hidden = true;
            this.part('saved').hidden = false;
        } catch (err) {
            status.kind = 'danger';
            status.textContent = err?.message ?? String(err);
        } finally {
            btn.disabled = false;
        }
    }
};
