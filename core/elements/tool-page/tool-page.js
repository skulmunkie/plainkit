import { showState } from '../../js/page-shell.js';
import { renderState } from '../../js/page-states.js';
import { loadElements } from '../../js/loader.js';

// Which control a field type builds; pk-input carries every scalar type through its own `type` attribute (STANDARDS.md: only existing components).
const CONTROL = { text: 'pk-input', email: 'pk-input', number: 'pk-input', date: 'pk-input', textarea: 'pk-textarea', select: 'pk-select' };
const RESULT_TAG = { stat: 'pk-stat', table: 'pk-table', code: 'pk-code-block' };

export default Base => class extends Base {
    connected() {
        if (this.$w) return;
        this.$w = true;
        this.part('form').addEventListener('submit', e => { e.preventDefault(); this.runNow(); });
        // The Run button is a real pk-* element in this shadow tree from the start (the static template, build-time bundled with this
        // element - core/elements/detail-layout does the same for its own strip and Next button); load it once here.
        loadElements(this.shadowRoot);
        this.buildFields();
    }
    changed(name) { if (name === 'config') this.buildFields(); }
    updated() { this.part('run').textContent = this.runLabel || 'Run'; }

    // Rebuilt only when config.input itself changes (a JSON prop, so a cheap string compare is the dirty check): every other prop change
    // (runLabel, heading) must never wipe what the reader already typed into a field.
    buildFields() {
        const key = JSON.stringify(this.config?.input ?? []);
        if (key === this.$builtFor) return;
        this.$builtFor = key;
        const doc = this.ownerDocument;
        const box = this.part('fields');
        box.replaceChildren();
        this.$controls = {};
        for (const f of this.config?.input ?? []) {
            const tag = CONTROL[f.type] ?? 'pk-input';
            const el = doc.createElement(tag);
            el.label = f.label ?? f.key;
            el.showLabel = true;
            if (f.placeholder) el.placeholder = f.placeholder;
            if (f.required) el.required = true;
            if (tag === 'pk-input' && f.type !== 'select' && f.type !== 'textarea') el.type = f.type ?? 'text';
            if (tag === 'pk-select') for (const o of f.options ?? []) { const opt = doc.createElement('option'); opt.value = String(o.value ?? o); opt.textContent = o.label ?? String(o); el.append(opt); }
            box.append(el);
            this.$controls[f.key] = el;
        }
        loadElements(box);
    }
    values() {
        const out = {};
        for (const [key, el] of Object.entries(this.$controls ?? {})) out[key] = el.value;
        return out;
    }

    // The host's run(values) is a callback property (STANDARDS.md: config is data, callbacks are set from script), never a config key.
    async runNow() {
        if (typeof this.run !== 'function') return;
        const outcome = this.part('outcome');
        showState(outcome, 'loading', { label: this.runLabel ? `${this.runLabel}…` : 'Working' });
        try {
            const result = await this.run(this.values());
            this.drawOutcome(result);
        } catch (err) {
            showState(outcome, 'error', { error: err, retry: () => this.runNow() });
        }
    }
    drawOutcome(result) {
        const doc = this.ownerDocument, outcome = this.part('outcome');
        renderState(outcome, 'ready');
        const type = this.config?.outcome ?? 'text';
        let el;
        if (type === 'text') { el = doc.createElement('p'); el.textContent = typeof result === 'string' ? result : (result?.text ?? ''); }
        else {
            el = doc.createElement(RESULT_TAG[type] ?? 'p');
            if (type === 'stat') Object.assign(el, result);
            else if (type === 'table') { el.columns = result?.columns ?? []; el.rows = result?.rows ?? []; }
            else if (type === 'code') el.textContent = typeof result === 'string' ? result : (result?.code ?? '');
        }
        outcome.append(el);
        loadElements(outcome);
    }
};
