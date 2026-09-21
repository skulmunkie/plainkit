// pk-dropzone behaviour: a drop target over a real file input. Files come from the picker or a drop; each is checked against accept, max-size and max-files; accepted files are listed
// with Remove and submitted with the form, rejected ones are listed with the reason and dropped. The pure helpers are exported for the Node tests.
const UNITS = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 };
// "5MB" -> 5242880; a plain number is bytes; anything else is null (no limit).
export function parseSize(text) {
    const m = /^\s*(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?\s*$/i.exec(String(text ?? ''));
    return m ? Math.round(Number(m[1]) * UNITS[(m[2] ?? 'b').toLowerCase()]) : null;
}
export function formatBytes(n) {
    if (n < 1024) return `${n} B`;
    const i = Math.min(3, Math.floor(Math.log(n) / Math.log(1024))); const v = n / 1024 ** i;
    return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${['B', 'KB', 'MB', 'GB'][i]}`;
}
// Does the file match an accept list (".csv,text/csv,image/*")? An empty list accepts everything.
export function acceptsFile(file, accept) {
    const tokens = String(accept ?? '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    if (!tokens.length) return true;
    const name = (file.name ?? '').toLowerCase(); const type = (file.type ?? '').toLowerCase();
    return tokens.some(t => (t.startsWith('.') ? name.endsWith(t) : t.endsWith('/*') ? type.startsWith(t.slice(0, -1)) : type === t));
}
// Split files into accepted and rejected (with a reason each), applying the type, size and count rules in that order.
export function validateFiles(files, { accept = '', maxSize = null, maxFiles = Infinity } = {}) {
    const accepted = []; const rejected = [];
    for (const file of files) {
        if (!acceptsFile(file, accept)) rejected.push({ file, reason: 'Not an accepted file type.' });
        else if (maxSize !== null && file.size > maxSize) rejected.push({ file, reason: `Larger than ${formatBytes(maxSize)}.` });
        else if (accepted.length >= maxFiles) rejected.push({ file, reason: `Only ${maxFiles} file${maxFiles === 1 ? '' : 's'} allowed.` });
        else accepted.push(file);
    }
    return { accepted, rejected };
}

export default Base => class extends Base {
    connected() {
        if (this.$init) return;
        this.$init = true;
        this.watchSlot('input', () => this.requestUpdate());
        const i = this.part('control'); const zone = this.part('zone');
        i.addEventListener('change', () => this.take(Array.from(i.files ?? [])));
        for (const t of ['dragenter', 'dragover']) zone.addEventListener(t, e => { e.preventDefault(); this.toggleAttribute('dragover', true); });
        zone.addEventListener('dragleave', () => this.toggleAttribute('dragover', false));
        zone.addEventListener('drop', e => { e.preventDefault(); this.toggleAttribute('dragover', false); this.drop(Array.from(e.dataTransfer?.files ?? [])); });
        this.part('list').addEventListener('click', e => { const b = e.target.closest?.('.rm'); if (b) this.take(this.$files.filter((_, n) => n !== Number(b.dataset.index))); });
        this.part('browse').addEventListener('click', () => this.pick());
    }
    // The input slot's own file input (a Blazor InputFile), if there is one.
    external() { const slot = this.slotted('input')[0]; return slot?.localName === 'input' ? slot : slot?.querySelector('input') ?? null; }
    // Opens the file picker, for a host's own button: like the native input it needs a user gesture. The slotted input opens its own picker when there is one.
    pick() { if (!this.disabled) (this.external() ?? this.part('control')).click(); }
    // With an input in the input slot (a Blazor InputFile) the zone is only a drop target: dropped files go into that input and it reports them (one file unless the input is multiple; nothing for a drop with no files).
    drop(files) {
        const ext = this.external();
        if (!ext) { this.take(files); return; }
        if (!ext.multiple) files = files.slice(0, 1); // like a native drop on a single-file input
        if (!files.length || ext.disabled || this.disabled) return;
        const dt = new DataTransfer(); for (const f of files) dt.items.add(f);
        ext.files = dt.files; ext.dispatchEvent(new Event('change', { bubbles: true }));
    }
    get files() { return [...(this.$files ??= [])]; }
    take(incoming) {
        const i = this.part('control');
        const r = validateFiles(incoming, { accept: this.accept, maxSize: parseSize(this.maxSize), maxFiles: this.multiple ? (this.maxFiles > 0 ? this.maxFiles : Infinity) : 1 });
        this.$files = r.accepted; this.$rejected = r.rejected;
        if (typeof DataTransfer !== 'undefined') { const dt = new DataTransfer(); for (const f of r.accepted) dt.items.add(f); i.files = dt.files; }
        this.requestUpdate();
        this.dispatchEvent(new Event('change', { bubbles: true, composed: true })); this.emit('pk-files', { count: r.accepted.length, rejectedCount: r.rejected.length, files: r.accepted, rejected: r.rejected });
    }
    clear() { this.take([]); }
    updated() {
        this.toggleAttribute('has-input', this.slotted('input').length > 0);
        this.$files ??= []; this.$rejected ??= [];
        const i = this.part('control'); const list = this.part('list'); const tpl = this.shadowRoot.querySelector('template');
        i.accept = this.accept; i.multiple = this.multiple;
        const btn = this.part('browse'), browse = Boolean(this.browseLabel); // with a browse button it is the one tab stop, and the input is only a pointer target
        i.tabIndex = browse ? -1 : 0; if (browse) i.setAttribute('aria-hidden', 'true'); else i.removeAttribute('aria-hidden');
        btn.disabled = this.disabled; btn.setAttribute('aria-label', this.label ? `${this.browseLabel}, ${this.label}` : this.browseLabel);
        const row = (name, note, err, index) => { const li = tpl.content.firstElementChild.cloneNode(true); li.querySelector('.name').textContent = name; li.querySelector('.note').textContent = note; if (err) { li.classList.add('err'); li.querySelector('.rm').remove(); } else { const b = li.querySelector('.rm'); b.dataset.index = String(index); b.setAttribute('aria-label', `Remove ${name}`); } return li; };
        list.replaceChildren(...this.$files.map((f, n) => row(f.name, formatBytes(f.size), false, n)), ...this.$rejected.map(x => row(x.file.name, x.reason, true, 0)));
        this.setValidity(this.required && this.$files.length === 0 ? { valueMissing: true } : {}, 'Choose a file.', browse ? btn : i);
        const fd = new FormData(); for (const f of this.$files) fd.append(this.name, f); this.setFormValue(fd);
    }
    onReset() { this.$files = []; this.$rejected = []; this.requestUpdate(); }
    focus(o) { this.part(this.browseLabel ? 'browse' : 'control').focus(o); }
};
