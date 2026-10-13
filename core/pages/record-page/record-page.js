import { showState, showTitleBar } from '../../js/page-shell.js';
import { renderState } from '../../js/page-states.js';
import { loadElements } from '../../js/loader.js';

const CONTROLS = 'pk-input,pk-textarea,pk-select,pk-checkbox,pk-switch,pk-range,pk-combobox';
const text = v => (v == null ? '' : String(v));
const norm = v => (v == null || v === false ? '' : String(v));
const key = f => f.key ?? f.name;
const kindOf = f => f.kind ?? f.type ?? 'text';
// A field def as pk-field-group reads it; in the older name/type spelling, help is the line under the control (the group's hint).
const spec = f => ({ ...f, key: key(f), kind: kindOf(f), ...(f.key == null && f.help ? { hint: f.help, help: undefined } : {}), options: f.options?.map(o => (typeof o === 'object' ? o : { value: String(o), label: String(o) })) });

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
        if (name === 'config') { if ((this.config?.id ?? null) !== this.$id) this.fetch(); else { if (this.$id == null && !this.dirty) this.$values = { ...this.config?.values }; this.bar(); this.draw(); } }
        else if (name === 'mode') this.draw();
        else if (name === 'deletable') this.part('delete').hidden = this.deleteHidden();
        else if (name === 'error') this.notice();
        else if (name === 'busy') this.lock();
    }

    refresh() { if (this.$w && this.isConnected) this.fetch(); }

    // The record is loaded by id (config.id, the route's param) through the load(id) callback; no id means a new record (no load, edit mode).
    async fetch() {
        const gen = this.$gen = (this.$gen ?? 0) + 1, box = this.part('state'), id = this.config?.id ?? null;
        this.$id = id;
        this.bar();
        this.part('layout').hidden = true;
        for (const p of ['edit', 'cancel', 'save', 'delete']) this.part(p).hidden = true;
        if (id == null || typeof this.load !== 'function') { this.$values = { ...this.config?.values }; this.done(); return; }
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
        this.notice();
        main.replaceChildren(editing ? this.form(doc, vals) : this.list(doc, this.fields, vals, this.config?.heading));
        side.replaceChildren(...(this.config?.sidebar ?? []).map(s => {
            const card = doc.createElement('pk-card');
            card.setAttribute('heading', s.heading ?? '');
            card.append(this.list(doc, this.fields.filter(f => s.fields?.includes(key(f))), vals, '', true));
            return card;
        }));
        const canEdit = this.config?.editable !== false && typeof this.save === 'function';
        this.part('edit').hidden = editing || !canEdit;
        this.part('cancel').hidden = !editing || this.$id == null;
        this.part('save').hidden = !editing || !this.fields.length;
        this.part('delete').hidden = this.deleteHidden();
        this.part('save').textContent = this.config?.saveLabel || 'Save';
        this.part('layout').hidden = false;
        this.lock();
        loadElements(this.shadowRoot);
    }
    deleteHidden() { return this.editing || this.$id == null || !(this.deletable || this.config?.deletable); }
    // The host's `error` text is the notice above the form (a save's own failure replaces it until the host sets it again); `busy` is the host's work in flight, so every button waits.
    notice() { if (this.error) showState(this.part('notice'), 'error', { description: this.error }); else renderState(this.part('notice'), 'ready'); }
    lock() { for (const p of ['edit', 'cancel', 'save', 'delete']) this.part(p).disabled = Boolean(this.busy); this.part('save').busy = Boolean(this.busy || this.$saving); }
    list(doc, fields, vals, heading, dense) {
        const list = doc.createElement('pk-field-list');
        if (heading) list.setAttribute('heading', heading);
        if (dense) { list.setAttribute('layout', 'stacked'); list.setAttribute('dense', ''); }
        for (const f of fields) {
            const dt = doc.createElement('dt'), dd = doc.createElement('dd'), raw = vals[key(f)], v = typeof raw === 'boolean' ? (raw ? 'Yes' : 'No') : text(raw);
            dt.textContent = f.label ?? key(f);
            // A host child slot="field-<name>" replaces the value (#1000); without one the slot shows the text.
            const slot = doc.createElement('slot');
            slot.name = `field-${key(f)}`;
            slot.textContent = (f.options?.find(o => text(o.value ?? o) === v)?.label ?? v) || '-';
            dd.append(slot);
            list.append(dt, dd);
        }
        return list;
    }
    // The edit form is a pk-field-group drawn from the same field defs (key, kind, label, hint, help, required, options, when ...); name and type are the older spellings of key and kind.
    form(doc, vals) {
        const pf = doc.createElement('pk-form'), form = doc.createElement('form'), group = doc.createElement('pk-field-group');
        pf.setAttribute('summary', '');
        group.setAttribute('label', this.config?.heading || this.config?.title || 'Record');
        group.fields = this.fields.map(spec);
        group.values = { ...vals };
        this.$group = group;
        form.append(group);
        pf.append(form);
        return pf;
    }
    controls() { return [...(this.$group?.shadowRoot?.querySelectorAll(CONTROLS) ?? [])]; }
    live() { return this.$group?.snapshot?.() ?? {}; }
    collect() {
        const out = { ...this.$values }, live = this.live();
        for (const f of this.fields) if (key(f) in live) out[key(f)] = kindOf(f) === 'number' && live[key(f)] !== '' ? Number(live[key(f)]) : live[key(f)];
        return out;
    }
    // Dirty means the controls differ from the last loaded or saved values; pk-record-dirty tells the app (which owns its router and can veto a leave).
    track() { if (this.editing) { const live = this.live(); this.setDirty(Object.keys(live).some(k => norm(live[k]) !== norm(this.$values?.[k]))); } }
    setDirty(v) { if (v !== Boolean(this.dirty)) { this.dirty = v; this.emit('pk-record-dirty', { dirty: v }); } }

    async submit() {
        if (this.$saving || this.busy || typeof this.save !== 'function') return;
        const gen = this.$gen, save = this.part('save'), values = this.collect();
        this.$saving = true; save.busy = true;
        renderState(this.part('notice'), 'ready');
        this.$group?.report?.(false);
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
            const fields = Object.entries(err?.errors ?? {}).filter(([n]) => this.fields.some(f => key(f) === n));
            for (const [n, m] of fields) this.$group.setError(n, text(m));
            if (fields.length) this.$group.focusField(fields[0][0]);
            else { showState(this.part('notice'), 'error', { heading: 'Could not save', error: err }); }
        } finally { this.$saving = false; this.lock(); }
    }
};
