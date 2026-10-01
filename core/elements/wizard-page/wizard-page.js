import { showState, showTitleBar } from '../../js/page-shell.js';
import { renderState } from '../../js/page-states.js';
import { loadElements } from '../../js/loader.js';

const CONTROL = { textarea: 'pk-textarea', select: 'pk-select' };
const text = v => (v == null ? '' : String(v));

export default Base => class extends Base {
    connected() {
        if (!this.$w) {
            this.$w = true;
            loadElements(this.shadowRoot);
            this.part('back').addEventListener('click', () => this.go(this.$i - 1));
            this.part('next').addEventListener('click', () => this.next());
            const panes = this.part('panes');
            panes.addEventListener('submit', e => e.preventDefault());
            panes.addEventListener('pk-valid', () => this.advance());
            for (const t of ['input', 'change']) panes.addEventListener(t, () => this.setDirty(true));
            // A click on a reached step goes back (no validation); moving forward is Next's job, so the stepper's own move is always cancelled.
            this.part('stepper').addEventListener('pk-step-change', e => { e.preventDefault(); if (e.detail.index < this.$i) this.go(e.detail.index); });
        }
        // The one subscription outside this element's tree: a reload or a closed tab with unsent answers asks first.
        this.$leave = e => { if (this.dirty) { e.preventDefault(); e.returnValue = ''; } };
        window.addEventListener('beforeunload', this.$leave);
        this.fetch();
    }
    disconnected() { this.$gen = (this.$gen ?? 0) + 1; window.removeEventListener('beforeunload', this.$leave); }
    changed(name) { if (name === 'config' && this.$w && this.isConnected) this.fetch(); }

    get steps() {
        const s = this.config?.steps ?? [];
        return this.config?.review ? [...s, { id: '$review', label: this.config.reviewLabel || 'Review', review: true }] : s;
    }

    // An optional load() returns draft answers before the first step (loading and error-with-Retry as on the record page).
    async fetch() {
        const gen = this.$gen = (this.$gen ?? 0) + 1, box = this.part('state');
        showTitleBar(this, this.part('header'));
        this.$panes = new Map(); this.$i = 0; this.$far = 0; this.$draft = {};
        this.part('panes').replaceChildren();
        this.part('card').hidden = this.part('stepper').hidden = true;
        if (typeof this.load === 'function') {
            showState(box, 'loading', { label: this.config?.label });
            try { this.$draft = { ...(await this.load()) }; } catch (err) {
                if (gen !== this.$gen) return;
                this.log.error('wizard load failed', err);
                showState(box, 'error', { error: err, retry: () => this.fetch() });
                return;
            }
            if (gen !== this.$gen) return;
        }
        renderState(box, 'ready'); this.setDirty(false);
        const doc = this.ownerDocument, stepper = this.part('stepper');
        stepper.replaceChildren(...this.steps.map(s => { const st = doc.createElement('pk-step'); st.setAttribute('heading', s.label ?? s.id); if (s.description) st.setAttribute('description', s.description); return st; }));
        stepper.errors = ''; stepper.current = 0;
        stepper.hidden = false; this.part('card').hidden = false;
        loadElements(this.shadowRoot);
        this.show(0, false);
    }

    // Show one step: its pane is built the first time and only hidden afterwards, so what was typed is kept when going back.
    show(i, focus = true) {
        const step = this.steps[i], panes = this.part('panes'), last = i === this.steps.length - 1;
        if (!step) return;
        this.$i = i; this.$far = Math.max(this.$far, i);
        let pane = this.$panes.get(step.id);
        if (!pane) { pane = this.build(step); this.$panes.set(step.id, pane); panes.append(pane); loadElements(pane); }
        else if (step.review) this.summarise(pane);
        for (const p of this.$panes.values()) p.hidden = p !== pane;
        this.part('heading').textContent = step.label ?? step.id;
        this.part('stepper').current = i;
        this.part('back').hidden = i === 0;
        this.part('next').textContent = last ? this.config?.submitLabel || 'Submit' : 'Next';
        renderState(this.part('notice'), 'ready');
        if (focus) this.part('heading').focus();
    }
    build(step) {
        const doc = this.ownerDocument, pane = doc.createElement('div'); pane.setAttribute('role', 'group'); pane.setAttribute('aria-label', step.label ?? step.id);
        if (step.review) { this.summarise(pane); return pane; }
        if (typeof this.mountStep === 'function' && !step.fields) { this.mountStep(pane, step); return pane; }
        const pf = doc.createElement('pk-form'), form = doc.createElement('form');
        pf.setAttribute('summary', '');
        for (const f of step.fields ?? []) {
            const field = doc.createElement('pk-field'), ctl = doc.createElement(CONTROL[f.type] ?? 'pk-input');
            field.setAttribute('label', f.label ?? f.name);
            if (f.help) field.setAttribute('help', f.help);
            if (f.required) { field.setAttribute('required', ''); ctl.setAttribute('required', ''); }
            ctl.setAttribute('name', f.name);
            if (!CONTROL[f.type] && f.type) ctl.setAttribute('type', f.type);
            for (const o of f.type === 'select' ? f.options ?? [] : []) {
                const opt = doc.createElement('option');
                opt.value = text(o.value ?? o); opt.textContent = o.label ?? text(o.value ?? o);
                ctl.append(opt);
            }
            // A select answers its first option until the user picks another (what it shows is what the review and submit carry).
            const first = f.type === 'select' ? f.options?.[0] : undefined;
            const init = this.$draft[f.name] ?? (first == null ? undefined : first.value ?? first);
            if (init != null) ctl.value = text(init);
            field.append(ctl); form.append(field);
        }
        pf.append(form); pane.append(pf);
        return pane;
    }
    // The review step lists every answer, step by step, as field lists (text only).
    summarise(pane) {
        const doc = this.ownerDocument, values = this.collect();
        pane.replaceChildren(...this.steps.filter(s => s.fields?.length).map(s => {
            const list = doc.createElement('pk-field-list');
            list.setAttribute('heading', s.label ?? s.id);
            for (const f of s.fields) {
                const dt = doc.createElement('dt'), dd = doc.createElement('dd'), v = text(values[f.name]);
                dt.textContent = f.label ?? f.name;
                dd.textContent = (f.options?.find(o => text(o.value ?? o) === v)?.label ?? v) || '-';
                list.append(dt, dd);
            }
            return list;
        }));
        loadElements(pane);
    }
    controls() { return [...this.part('panes').querySelectorAll('[name]')]; }
    collect() {
        const out = { ...this.$draft }, fields = this.steps.flatMap(s => s.fields ?? []);
        for (const c of this.controls()) {
            const name = c.getAttribute('name');
            out[name] = fields.find(f => f.name === name)?.type === 'number' && c.value !== '' ? Number(c.value) : c.value;
        }
        return out;
    }

    // Next validates the step: the pane's own form first (pk-form focuses the first problem), then validate(stepId, values) through advance().
    next() {
        if (this.$busy) return;
        const form = this.$panes.get(this.steps[this.$i]?.id)?.querySelector('form');
        if (form) form.requestSubmit(); else this.advance();
    }
    async advance() {
        if (this.$busy) return;
        const gen = this.$gen, step = this.steps[this.$i], last = this.$i === this.steps.length - 1, btn = this.part('next'), values = this.collect();
        this.$busy = true; btn.busy = true;
        renderState(this.part('notice'), 'ready');
        for (const f of this.part('panes').querySelectorAll('pk-field[error]')) f.removeAttribute('error');
        try {
            if (!step.review && typeof this.validate === 'function') { const r = await this.validate(step.id, values); if (r?.errors) throw r; }
            if (gen !== this.$gen) return;
            this.part('stepper').errors = '';
            if (!last) { this.show(this.$i + 1); return; }
            if (typeof this.submit === 'function') await this.submit(values);
            if (gen !== this.$gen) return;
            this.finish(values);
        } catch (err) {
            if (gen !== this.$gen) return;
            this.log.error('wizard step failed', err);
            this.fail(err, step);
        } finally { this.$busy = false; btn.busy = false; }
    }
    // { errors: { field: message } } marks fields inline (on the step that owns the field: a submit can name one from an earlier step); any other error is a notice.
    fail(err, step) {
        const errors = Object.entries(err?.errors ?? {});
        const owner = (errors.length && this.steps.find(s => s.fields?.some(f => f.name === errors[0][0]))) || step;
        if (errors.length) {
            if (owner !== step) this.show(this.steps.indexOf(owner), false);
            const found = errors.map(([n, m]) => [this.controls().find(c => c.getAttribute('name') === n), m]).filter(([c]) => c);
            for (const [c, m] of found) c.closest('pk-field')?.setAttribute('error', text(m));
            if (found.length) { this.part('stepper').errors = String(this.steps.indexOf(owner)); found[0][0].focus(); return; }
        }
        showState(this.part('notice'), 'error', { heading: 'Could not continue', error: err });
    }
    finish(values) {
        this.setDirty(false);
        this.part('card').hidden = this.part('stepper').hidden = true;
        showState(this.part('state'), 'empty', { heading: this.config?.doneHeading || 'All done', description: this.config?.doneDescription });
        this.emit('pk-wizard-submit', { values });
    }
    go(i) { if (i >= 0 && i < this.steps.length && i <= this.$far && !this.$busy) this.show(i); }
    setDirty(v) { if (v !== Boolean(this.dirty)) { this.dirty = v; this.emit('pk-wizard-dirty', { dirty: v }); } }
};
