import { showState, showTitleBar } from '../../js/page-shell.js';
import { renderState } from '../../js/page-states.js';
import { loadElements } from '../../js/loader.js';
import { actionItems, renderActions } from '../../js/page-actions.js';

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
            // A committed answer (a blur or a choice, not each keystroke), as pk-record-change: an app autosaves a draft from it.
            panes.addEventListener('change', e => {
                const c = e.target?.closest?.('[name]'), key = c?.getAttribute('name');
                if (!key) return;
                this.emit('pk-wizard-change', { key, value: this.collect()[key], values: this.collect(), step: this.steps[this.$i]?.id });
                if (this.config?.liveValidate) this.live(key);
            });
            // A step drawn from field specs (step.specs, a pk-field-group): its commit is pk-field-change, not a native change on a named control.
            panes.addEventListener('pk-field-change', e => {
                const { key, value, values } = e.detail;
                this.setDirty(true);
                this.emit('pk-wizard-change', { key, value, values: { ...this.collect(), ...values }, step: this.steps[this.$i]?.id });
                if (this.config?.liveValidate) this.live(key);
            });
            this.part('submit').addEventListener('click', () => this.next(true));
            // A click on a reached step goes back (no validation); moving forward is Next's job, so the stepper's own move is always cancelled.
            this.part('stepper').addEventListener('pk-step-change', e => { e.preventDefault(); if (e.detail.index < this.$i) this.go(e.detail.index); });
        }
        // The one subscription outside this element's tree: a reload or a closed tab with unsent answers asks first.
        this.$leave = e => { if (this.dirty) { e.preventDefault(); e.returnValue = ''; } };
        window.addEventListener('beforeunload', this.$leave);
        this.fetch();
    }
    disconnected() { this.$gen = (this.$gen ?? 0) + 1; window.removeEventListener('beforeunload', this.$leave); }
    // Run load() again and restart at the first step (the Blazor bridge sets load after the first draw).
    refresh() { if (this.$w && this.isConnected) this.fetch(); }
    changed(name) { if (name === 'config' && this.$w && this.isConnected) this.fetch(); }

    get steps() {
        const s = this.config?.steps ?? [];
        return this.config?.review ? [...s, { id: '$review', label: this.config.reviewLabel || 'Review', review: true }] : s;
    }

    // An optional load() returns draft answers before the first step (loading and error-with-Retry as on the record page).
    async fetch() {
        const gen = this.$gen = (this.$gen ?? 0) + 1, box = this.part('state');
        showTitleBar(this, this.part('header'));
        this.$panes = new Map(); this.$groups = new Map(); this.$i = 0; this.$far = 0; this.$draft = {};
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
        // The footer actions are the shared renderer's (#1943); a press keeps its own event, pk-wizard-action with the answers so far, and also raises pk-action { key }.
        const warn = (k, m) => this.warnOnce?.(k, m);
        this.part('actions').replaceChildren(...renderActions(this, actionItems((this.config?.footerActions ?? []).map(a => ({ variant: 'ghost', ...a })), null, warn), { slot: null, warn, onPress: (a, fire) => { this.emit('pk-wizard-action', { key: a.key, values: this.collect(), step: this.steps[this.$i]?.id }); fire(); } }));
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
        this.part('submit').textContent = this.config?.submitLabel || 'Submit';
        this.part('submit').hidden = Boolean(last || !this.config?.submitEarly || step.review);
        this.part('next').textContent = last ? this.config?.submitLabel || 'Submit' : 'Next';
        renderState(this.part('notice'), 'ready');
        if (focus) this.part('heading').focus();
    }
    build(step) {
        const doc = this.ownerDocument, pane = doc.createElement('div'); pane.setAttribute('role', 'group'); pane.setAttribute('aria-label', step.label ?? step.id);
        if (step.review) { this.summarise(pane); return pane; }
        if (!step.fields && !step.specs) { // a step without fields is the app's: mountStep draws it, else the light-DOM child slot="step-<id>" is projected (the Blazor wrapper's way)
            if (typeof this.mountStep === 'function') this.mountStep(pane, step);
            else { const slot = doc.createElement('slot'); slot.setAttribute('name', 'step-' + step.id); pane.append(slot); }
            return pane;
        }
        const pf = doc.createElement('pk-form'), form = doc.createElement('form');
        pf.setAttribute('summary', '');
        if (step.specs) { // field specs (#2011): one pk-field-group draws them, so whenExpr, optionsBy and the kinds are the group's own
            const group = doc.createElement('pk-field-group'), values = { ...this.$draft };
            for (const f of step.specs) if (f.kind === 'select' && !f.optionsBy && !f.placeholder && values[f.key] == null && f.options?.length) values[f.key] = f.options[0].value ?? f.options[0];
            group.fields = step.specs; group.values = values;
            this.$groups.set(step.id, group);
            form.append(group); pf.append(form); pane.append(pf);
            return pane;
        }
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
    // The fields of a step as { name, label, type, options }: its own list, or the key, kind and options of its specs (a dependent select lists every option it can have).
    fieldsOf(s) {
        return s.fields ?? (s.specs ?? []).map(f => ({ name: f.key, label: f.label, type: f.kind, options: f.options ?? Object.values(f.optionsBy?.map ?? {}).flat() }));
    }
    // The review step lists every answer, step by step, as field lists (text only).
    summarise(pane) {
        const doc = this.ownerDocument, values = this.collect();
        pane.replaceChildren(...this.steps.filter(s => this.fieldsOf(s).length).map(s => {
            const list = doc.createElement('pk-field-list');
            list.setAttribute('heading', s.label ?? s.id);
            for (const f of this.fieldsOf(s)) {
                const dt = doc.createElement('dt'), dd = doc.createElement('dd'), v = text(values[f.name]);
                dt.textContent = f.label ?? f.name;
                dd.textContent = (f.options?.find(o => text(o.value ?? o) === v)?.label ?? v) || '-';
                list.append(dt, dd);
            }
            return list;
        }));
        loadElements(pane);
    }
    // Named controls of the panes, including the ones a slotted step projects (light DOM children of the host).
    controls() {
        const panes = this.part('panes'), out = [...panes.querySelectorAll('[name]')];
        for (const slot of panes.querySelectorAll('slot')) for (const el of slot.assignedElements({ flatten: true })) out.push(...(el.hasAttribute('name') ? [el] : []), ...el.querySelectorAll('[name]'));
        return out;
    }
    // config.liveValidate: a committed answer runs validate(stepId, values, { live: true, key }) without Next; { errors } marks fields, anything else clears the field.
    async live(key) {
        const gen = this.$gen, tok = this.$lv = (this.$lv ?? 0) + 1, step = this.steps[this.$i];
        if (!step || step.review || typeof this.validate !== 'function') return;
        let r;
        try { r = await this.validate(step.id, this.collect(), { live: true, key }); } catch (err) { this.log.warn('live validate failed', err); return; }
        if (gen !== this.$gen || tok !== this.$lv) return;
        for (const g of this.$groups.values()) for (const k of Object.keys(g.snapshot())) { const m = r?.errors?.[k]; if (k === key || m != null) g.setError(k, m == null ? '' : text(m)); }
        for (const c of this.controls()) {
            const n = c.getAttribute('name'), f = c.closest('pk-field'), m = r?.errors?.[n];
            if (!f || (n !== key && m == null)) continue;
            if (m == null) f.removeAttribute('error'); else f.setAttribute('error', text(m));
        }
    }
    collect() {
        const out = { ...this.$draft }, fields = this.steps.flatMap(s => this.fieldsOf(s));
        for (const g of this.$groups?.values() ?? []) Object.assign(out, g.snapshot());
        for (const c of this.controls()) {
            const name = c.getAttribute('name');
            out[name] = fields.find(f => f.name === name)?.type === 'number' && c.value !== '' ? Number(c.value) : c.value;
        }
        return out;
    }

    // Next validates the step: the pane's own form first (pk-form focuses the first problem), then validate(stepId, values) through advance().
    // next(true) is the early submit (config.submitEarly): it validates this step only, then submits every answer given so far.
    next(early = false) {
        if (this.$busy) return;
        this.$early = early === true;
        const form = this.$panes.get(this.steps[this.$i]?.id)?.querySelector('form');
        if (form) form.requestSubmit(); else this.advance();
    }
    async advance() {
        if (this.$busy) return;
        const early = this.$early; this.$early = false;
        const gen = this.$gen, step = this.steps[this.$i], last = early || this.$i === this.steps.length - 1, btn = this.part('next'), values = this.collect();
        this.$busy = true; btn.busy = true;
        renderState(this.part('notice'), 'ready');
        for (const c of this.controls()) c.closest('pk-field')?.removeAttribute('error');
        for (const g of this.$groups.values()) g.report(false);
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
        const owner = (errors.length && this.steps.find(s => this.fieldsOf(s).some(f => f.name === errors[0][0]))) || step;
        if (errors.length) {
            if (owner !== step) this.show(this.steps.indexOf(owner), false);
            const grp = this.$groups.get(owner.id), mine = grp ? errors.filter(([n]) => n in grp.snapshot()) : [];
            for (const [n, m] of mine) grp.setError(n, text(m));
            if (mine.length) { this.part('stepper').errors = String(this.steps.indexOf(owner)); grp.focusField(mine[0][0]); return; }
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
