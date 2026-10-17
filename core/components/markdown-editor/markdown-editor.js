// pk-markdown-editor behaviour: the value is Markdown text in a real textarea. Buttons and Ctrl/Cmd+B, I, K run the pure editing commands of js/markdown/commands.js
// and write the result back through the browser's own editing path (one undo step). The parser and the preview renderer are imported on first use, never statically.
import { loadElements } from '../../js/loader.js';

/** The commands the toolbar can offer: the label (the accessible name), what the button shows, and the Ctrl/Cmd key. */
export const COMMANDS = {
    bold: { label: 'Bold', key: 'b' },
    italic: { label: 'Italic', key: 'i' },
    heading: { label: 'Heading' },
    quote: { label: 'Quote', text: '"' },
    ul: { label: 'Bulleted list', text: '•' },
    ol: { label: 'Numbered list', text: '1.' },
    link: { label: 'Link', icon: 'link', key: 'k' },
};
export const DEFAULT_TOOLBAR = 'bold italic heading quote ul ol link';
/** The known command names in a toolbar value, in order, each once. */
export const parseToolbar = s => [...new Set(String(s ?? '').split(/\s+/).filter(c => Object.hasOwn(COMMANDS, c)))];
/** The smallest replacement that turns `a` into `b`: [from, removeTo, inserted], so the edit touches only what changed. */
export function diffRange(a, b) {
    let p = 0;
    while (p < a.length && p < b.length && a[p] === b[p]) p++;
    let s = 0;
    while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
    return [p, a.length - s, b.slice(p, b.length - s)];
}
const SPLIT_FROM = 640;

export default Base => class extends Base {
    connected() {
        if (!this.$init) {
            this.$init = true; this.$initial = this.value;
            const t = this.part('control');
            t.addEventListener('input', () => { this.clearError(); this.value = t.value; });
            t.addEventListener('pk-value-change', e => { e.stopPropagation(); this.emit('pk-change', { value: this.value }); });
            t.addEventListener('compositionstart', () => { this.$comp = true; });
            t.addEventListener('compositionend', () => { this.$comp = false; });
            t.addEventListener('keydown', e => this.shortcut(e));
            t.addEventListener('focusin', () => this.commandsModule(), { once: true });
            t.addEventListener('paste', e => this.edit(e, m => m.pasteLink, e.clipboardData?.getData('text/plain')));
            const bar = this.part('commands');
            bar.addEventListener('click', e => { const b = e.target.closest?.('pk-button'); if (b) this.run(b.dataset.cmd); });
            bar.addEventListener('keydown', e => this.rove(e));
            this.part('tabs').addEventListener('pk-tab-change', e => { e.stopPropagation(); this.mode = e.detail.value === 'preview' ? 'preview' : 'write'; });
            this.part('link-ok').addEventListener('click', () => this.addLink());
            this.part('link-cancel').addEventListener('click', () => this.closeLink());
            this.part('url').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); this.addLink(); } else if (e.key === 'Escape') { e.stopPropagation(); this.closeLink(); } });
        }
        if (this.shadowRoot) loadElements(this.shadowRoot); // the tabs, toolbar, buttons, input and textarea this element draws, defined even when the host page uses none itself
        if (typeof ResizeObserver !== 'undefined') { this.$ro = new ResizeObserver(() => this.fit()); this.$ro.observe(this); }
        this.fit();
    }
    disconnected() { this.$ro?.disconnect(); }
    fit() {
        const split = this.layout === 'split' && this.clientWidth >= SPLIT_FROM;
        if (split === Boolean(this.$split)) return;
        this.$split = split; this.toggleAttribute('data-split', split); this.requestUpdate();
    }
    changed(name) { if (name === 'layout') this.fit(); }
    get commands() { return parseToolbar(this.toolbar); }
    // The real textarea inside pk-textarea (null until that element is defined): selection and editing commands act on it.
    get ta() { const c = this.part('control'); return typeof c?.part === 'function' ? c.part('control') : null; }
    get editable() { return !this.disabled && !this.readonly; }

    updated() {
        const box = this.part('control'), t = this.ta;
        if (!t) customElements.whenDefined('pk-textarea').then(() => this.requestUpdate());
        if (box.value !== this.value) box.value = this.value;
        const preview = this.part('preview'), showPreview = this.mode === 'preview', split = Boolean(this.$split);
        this.part('write').hidden = !split && showPreview; preview.hidden = !split && !showPreview;
        if (!preview.hidden && this.$rendered !== this.value) this.renderPreview();
        if (this.$tb !== this.toolbar) { this.$tb = this.toolbar; this.buildToolbar(); }
        for (const b of this.part('commands').children) b.disabled = !this.editable;
        this.syncRove();
        const flags = {};
        if (t?.willValidate) for (const k in t.validity) flags[k] = t.validity[k];
        this.setValidity(flags, t?.validationMessage ?? '', t ?? undefined);
        this.setFormValue(this.value);
    }
    onReset() { this.value = this.$initial ?? ''; }
    onRestore(state) { this.value = state ?? ''; }
    focus(o) { this.part('control').focus(o); }
    select() { this.part('control').select(); }

    // The preview is built from the parsed Markdown with DOM APIs (js/markdown/render.js), loaded the first time a preview is shown.
    renderPreview() {
        const value = this.value;
        this.$rm ??= import('../../js/markdown/render.js').catch(e => { this.$rm = null; this.log.error('markdown renderer failed to load', e); });
        this.$rm.then(m => {
            if (!m || !this.isConnected || value !== this.value) return;
            this.part('preview').replaceChildren(m.renderMarkdown(value, this.ownerDocument));
            this.$rendered = value;
        });
    }

    buildToolbar() {
        const bar = this.part('commands');
        bar.replaceChildren(...this.commands.map(c => {
            const d = COMMANDS[c], b = this.ownerDocument.createElement('pk-button');
            b.setAttribute('variant', 'ghost'); b.setAttribute('size', 'mini'); b.setAttribute('label', d.label); b.dataset.cmd = c;
            if (d.key) { b.setAttribute('aria-keyshortcuts', `Control+${d.key.toUpperCase()} Meta+${d.key.toUpperCase()}`); b.setAttribute('title', `${d.label} (Ctrl+${d.key.toUpperCase()})`); } else b.setAttribute('title', d.label);
            if (d.icon) { b.setAttribute('icon', ''); b.setAttribute('icon-name', d.icon); } else b.textContent = d.text ?? d.label[0];
            return b;
        }));
        this.$ri = 0;
        loadElements(bar);
    }
    // Roving tabindex on the real buttons inside each pk-button: one Tab stop for the whole toolbar.
    syncRove() {
        const bs = [...this.part('commands').children];
        this.$ri = Math.min(this.$ri ?? 0, Math.max(0, bs.length - 1));
        bs.forEach((b, i) => { if (typeof b.part === 'function') b.part('control')?.setAttribute('tabindex', i === this.$ri && this.editable ? '0' : '-1'); });
        if (bs.some(b => typeof b.part !== 'function')) customElements.whenDefined('pk-button').then(() => this.syncRove());
    }
    rove(e) {
        const bs = [...this.part('commands').children].filter(b => !b.disabled);
        if (e.key === 'Escape') { e.preventDefault(); this.focus(); return; }
        const i = bs.indexOf(e.target.closest?.('pk-button')), rtl = getComputedStyle(this).direction === 'rtl';
        if (i < 0) return;
        const to = { ArrowRight: rtl ? i - 1 : i + 1, ArrowLeft: rtl ? i + 1 : i - 1, Home: 0, End: bs.length - 1 }[e.key];
        if (to === undefined) return;
        e.preventDefault();
        this.$ri = [...this.part('commands').children].indexOf(bs[(to + bs.length) % bs.length]);
        this.syncRove(); bs[(to + bs.length) % bs.length].focus();
    }
    // Enter in a list and a pasted address over a selection run synchronously on the loaded commands module (the first focus starts the load); until it is there the browser's own behaviour stands.
    edit(e, pick, ...x) { const t = this.ta, r = this.$m && t && this.editable && !this.$comp && pick(this.$m)(t.value, t.selectionStart, t.selectionEnd, ...x); if (r) { e.preventDefault(); this.apply(r); } }
    shortcut(e) {
        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) return this.edit(e, m => m.continueList);
        if (e.isComposing || this.$comp || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
        const c = this.commands.find(n => COMMANDS[n].key === e.key.toLowerCase());
        if (c) { e.preventDefault(); this.run(c); }
    }

    commandsModule() { return (this.$cm ??= import('../../js/markdown/commands.js').then(m => (this.$m = m)).catch(e => { this.$cm = null; this.log.error('markdown commands failed to load', e); })); }
    clearError() { const p = this.part('error'); p.hidden = true; p.textContent = ''; }
    showError(msg) { const p = this.part('error'); p.textContent = msg; p.hidden = false; }
    async run(cmd, arg) {
        if (!this.editable || this.$comp || !this.commands.includes(cmd)) return;
        this.clearError();
        if (cmd === 'link' && arg === undefined) { this.openLink(); return; }
        const t = this.ta;
        if (!t) return;
        const [a, b] = [t.selectionStart, t.selectionEnd];
        const m = await this.commandsModule();
        if (!m || !this.editable) return;
        const f = m.byCommand[cmd];
        this.apply(f(t.value, a, b, arg));
    }
    // Write a command's result into the textarea as an edit (so Ctrl+Z undoes it in one step), then set the selection it asks for.
    apply(r) {
        const t = this.ta, old = t.value;
        if (r.error) { this.showError(r.error); return false; }
        if (r.text !== old) {
            if (this.maxlength && r.text.length > old.length && r.text.length > Number(this.maxlength)) return false;
            const [from, to, ins] = diffRange(old, r.text);
            t.focus(); t.setSelectionRange(from, to);
            const done = ins ? this.ownerDocument.execCommand?.('insertText', false, ins) : this.ownerDocument.execCommand?.('delete');
            if (!done || t.value !== r.text) t.setRangeText(ins, from, to, 'end'); // no editing command here (an unfocused page): still an edit, not undoable
            this.value = t.value;
        }
        t.focus(); t.setSelectionRange(r.start, r.end);
        this.emit('pk-change', { value: this.value });
        return true;
    }

    openLink() {
        const t = this.ta, bar = this.part('linkbar'), url = this.part('url');
        this.$sel = [t.selectionStart, t.selectionEnd];
        bar.hidden = false; url.value = ''; url.focus?.();
    }
    closeLink() { this.part('linkbar').hidden = true; this.clearError(); this.focus(); }
    async addLink() {
        const t = this.ta, [a, b] = this.$sel ?? [t.selectionStart, t.selectionEnd];
        const m = await this.commandsModule();
        if (!m) return;
        t.setSelectionRange(a, b);
        if (this.apply(m.insertLink(t.value, a, b, this.part('url').value))) this.part('linkbar').hidden = true;
    }
};
