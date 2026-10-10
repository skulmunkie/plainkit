import { showState, showTitleBar } from '../../js/page-shell.js';
import { renderState } from '../../js/page-states.js';
import { loadElements } from '../../js/loader.js';

// Which control a field builds; pk-input carries every scalar type through its own `type` attribute.
const CONTROL = { textarea: 'pk-textarea', select: 'pk-select' };
const text = v => (v == null ? '' : String(v));

export default Base => class extends Base {
    connected() {
        if (!this.$w) {
            this.$w = true;
            loadElements(this.shadowRoot);
            this.part('edit').addEventListener('click', () => { this.mode = 'edit'; });
            this.part('cancel').addEventListener('click', () => { this.setDirty(false); this.mode = 'view'; });
            this.part('save').addEventListener('click', () => this.part('main').querySelector('form')?.requestSubmit());
            this.part('delete').addEventListener('click', () => this.emit('pk-record-delete', { id: this.$id }));
            const main = this.part('main');
            main.addEventListener('submit', e => e.preventDefault());
            main.addEventListener('pk-valid', () => this.submit());
            for (const t of ['input', 'change']) main.addEventListener(t, () => this.track());
        }
        // The one subscription outside this element's tree: a reload or a closed tab while edits are unsaved asks first.
        this.$leave = e => { if (this.dirty) { e.preventDefault(); e.returnValue = ''; } };
        window.addEventListener('beforeunload', this.$leave);
        this.fetch();
    }
    disconnected() { this.$gen = (this.$gen ?? 0) + 1; window.removeEventListener('beforeunload', this.$leave); }
    changed(name) {
        if (!this.$w || !this.isConnected) return;
        if (name === 'config') { if ((this.config?.id ?? null) !== this.$id) this.fetch(); else { this.bar(); this.draw(); } }
        else if (name === 'mode') this.draw();
    }

    refresh() { if (this.$w && this.isConnected) this.fetch(); }

    // The record is loaded by id (config.id, the route's param) through the load(id) callback; no id means a new record (no load, edit mode).
    async fetch() {
        const gen = this.$gen = (this.$gen ?? 0) + 1, box = this.part('state'), id = this.config?.id ?? null;
        this.$id = id;
        this.bar();
        this.part('layout').hidden = true;
        for (const p of ['edit', 'cancel', 'save', 'delete']) this.part(p).hidden = true;
        if (id == null || typeof this.load !== 'function') { this.$values = {}; this.done(); return; }
        showState(box, 'loading', { label: this.config?.label });
        try {
            const rec = await this.load(id);
            if (gen !== this.$gen) return;
            if (rec == null) { showState(box, 'empty', { heading: this.config?.emptyHeading || 'Record not found' }); return; }
            this.$values = { ...rec };
            this.done();
        } catch (err) {
            if (gen !== this.$gen) return;
            this.log.error('record load failed', err);
            showState(box, 'error', { error: err, retry: () => this.fetch() });
        }
    }
    // The shared title bar; config.heading already titles the field list, so the page's own heading is config.title.
    bar() { showTitleBar(this, this.part('header'), { ...this.config, heading: this.config?.title }); }
    done() { renderState(this.part('state'), 'ready'); this.setDirty(false); this.draw(); }
    get editing() { return this.mode === 'edit' || this.$id == null; }
    get fields() { return this.config?.fields ?? []; }

    // Not named render(): the base class calls render() on every prop change (dirty, mode), which would rebuild the form under the reader on the first keystroke.
    draw() {
        const doc = this.ownerDocument, main = this.part('main'), side = this.part('side'), vals = this.$values ?? {}, editing = this.editing;
        renderState(this.part('notice'), 'ready');
        main.replaceChildren(editing ? this.form(doc, vals) : this.list(doc, this.fields, vals, this.config?.heading));
        side.replaceChildren(...(this.config?.sidebar ?? []).map(s => {
            const card = doc.createElement('pk-card');
            card.setAttribute('heading', s.heading ?? '');
            card.append(this.list(doc, this.fields.filter(f => s.fields?.includes(f.name)), vals, '', true));
            return card;
        }));
        const canEdit = this.config?.editable !== false && typeof this.save === 'function';
        this.part('edit').hidden = editing || !canEdit;
        this.part('cancel').hidden = !editing || this.$id == null;
        this.part('save').hidden = !editing || !this.fields.length;
        this.part('delete').hidden = editing || this.$id == null || !this.config?.deletable;
        this.part('save').textContent = this.config?.saveLabel || 'Save';
        this.part('layout').hidden = false;
        loadElements(this.shadowRoot);
    }
    list(doc, fields, vals, heading, dense) {
        const list = doc.createElement('pk-field-list');
        if (heading) list.setAttribute('heading', heading);
        if (dense) { list.setAttribute('layout', 'stacked'); list.setAttribute('dense', ''); }
        for (const f of fields) {
            const dt = doc.createElement('dt'), dd = doc.createElement('dd'), v = text(vals[f.name]);
            dt.textContent = f.label ?? f.name;
            dd.textContent = (f.options?.find(o => text(o.value ?? o) === v)?.label ?? v) || '-';
            list.append(dt, dd);
        }
        return list;
    }
    form(doc, vals) {
        const pf = doc.createElement('pk-form'), form = doc.createElement('form');
        pf.setAttribute('summary', '');
        this.$fields = new Map();
        for (const f of this.fields) {
            const field = doc.createElement('pk-field'), ctl = doc.createElement(CONTROL[f.type] ?? 'pk-input');
            field.setAttribute('label', f.label ?? f.name);
            if (f.help) field.setAttribute('help', f.help);
            if (f.required) field.setAttribute('required', '');
            ctl.setAttribute('name', f.name);
            if (f.required) ctl.setAttribute('required', '');
            if (f.readonly) ctl.setAttribute('readonly', '');
            if (!CONTROL[f.type] && f.type) ctl.setAttribute('type', f.type);
            for (const o of f.type === 'select' ? f.options ?? [] : []) {
                const opt = doc.createElement('option');
                opt.value = text(o.value ?? o); opt.textContent = o.label ?? text(o.value ?? o);
                ctl.append(opt);
            }
            ctl.value = text(vals[f.name]);
            field.append(ctl);
            this.$fields.set(f.name, field);
            form.append(field);
        }
        pf.append(form);
        return pf;
    }
    controls() { return [...this.part('main').querySelectorAll('[name]')]; }
    collect() {
        const out = { ...this.$values };
        for (const c of this.controls()) {
            const f = this.fields.find(x => x.name === c.getAttribute('name'));
            out[f.name] = f.type === 'number' && c.value !== '' ? Number(c.value) : c.value;
        }
        return out;
    }
    // Dirty means the controls differ from the last loaded or saved values; pk-record-dirty tells the app (which owns its router and can veto a leave).
    track() { if (this.editing) this.setDirty(this.controls().some(c => text(this.$values?.[c.getAttribute('name')]) !== c.value)); }
    setDirty(v) { if (v !== Boolean(this.dirty)) { this.dirty = v; this.emit('pk-record-dirty', { dirty: v }); } }

    async submit() {
        if (this.$saving || typeof this.save !== 'function') return;
        const gen = this.$gen, save = this.part('save'), values = this.collect();
        this.$saving = true; save.busy = true;
        renderState(this.part('notice'), 'ready');
        for (const f of this.$fields?.values() ?? []) f.removeAttribute('error');
        try {
            const out = await this.save(values);
            if (gen !== this.$gen) return;
            this.$values = { ...values, ...(out && typeof out === 'object' ? out : {}) };
            this.emit('pk-record-save', { values: this.$values });
            this.setDirty(false);
            if (this.$id != null) this.mode = 'view'; else this.draw();
        } catch (err) {
            if (gen !== this.$gen) return;
            this.log.error('record save failed', err);
            // A rejection carrying { errors: { fieldName: message } } marks those fields inline; any other is a notice above the form.
            const fields = Object.entries(err?.errors ?? {}).map(([n, m]) => [this.controls().find(c => c.getAttribute('name') === n), m]).filter(([c]) => c);
            for (const [c, m] of fields) this.$fields.get(c.getAttribute('name')).setAttribute('error', text(m));
            if (fields.length) fields[0][0].focus();
            else { showState(this.part('notice'), 'error', { heading: 'Could not save', error: err }); }
        } finally { this.$saving = false; save.busy = false; }
    }
};
