import { loadElements } from '../../js/loader.js';
import { showTitleBar } from '../../js/page-shell.js';
import { buildField, read, write } from '../../js/page-fields.js';

export default Base => class extends Base {
    connected() {
        if (this.$w) return;
        this.$w = true;
        // The bar, buttons and alerts are real pk-* elements in this shadow tree from the start; load them once here (core/components/detail-layout
        // does the same for its own strip and Next button, and pk-tool-page for its Run button).
        loadElements(this.shadowRoot);
        this.part('form').addEventListener('submit', e => { e.preventDefault(); this.saveNow(); });
        for (const type of ['pk-value-change', 'pk-change', 'pk-range']) this.part('form').addEventListener(type, () => this.paint());
        this.part('discard').addEventListener('click', () => this.discard());
        this.buildTitleBar();
        this.buildSections();
    }
    changed(name) { if (name === 'config') { this.buildTitleBar(); this.buildSections(); } else if (name === 'values') this.applyValues(); }

    // The shared shell's title bar (js/page-shell.js): config.heading, breadcrumb and actions; nothing drawn when none is set.
    buildTitleBar() { showTitleBar(this, this.part('header')); }

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
