// pk-colour-input behaviour: the native colour picker as a swatch beside an editable hex field that stay in step. The field accepts #abc, abc and #aabbcc, marks itself invalid while
// it is not a colour, and is normalised to #rrggbb when left.
// '#rrggbb' (lowercase) from #abc, abc, #aabbcc or aabbcc; null when it is not a hex colour.
export function normalizeHex(text) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(text ?? '').trim());
    if (!m) return null;
    const h = m[1].length === 3 ? Array.from(m[1], c => c + c).join('') : m[1];
    return `#${h.toLowerCase()}`;
}

export default Base => class extends Base {
    connected() {
        if (this.$init) return;
        this.$init = true; this.$initial = this.value;
        const sw = this.part('swatch'); const hex = this.part('control');
        sw.addEventListener('input', () => { this.$typing = false; this.value = sw.value; this.fire(); });
        hex.addEventListener('input', () => { const h = normalizeHex(hex.value); this.$typing = true; this.$bad = !h && hex.value.trim() !== ''; if (h) { this.value = h; this.fire(); } else this.requestUpdate(); });
        hex.addEventListener('blur', () => { this.$typing = false; this.$bad = false; this.requestUpdate(); });
        hex.addEventListener('change', () => this.dispatchEvent(new Event('change', { bubbles: true, composed: true })));
        sw.addEventListener('change', () => this.dispatchEvent(new Event('change', { bubbles: true, composed: true })));
    }
    fire() { this.dispatchEvent(new Event('input', { bubbles: true, composed: true })); this.emit('pk-colour', { value: this.value }); }
    updated() {
        const sw = this.part('swatch'); const hex = this.part('control');
        const ok = normalizeHex(this.value);
        if (ok && sw.value !== ok) sw.value = ok;
        if (!this.$typing) hex.value = ok ?? this.value;
        hex.setAttribute('aria-invalid', String(this.invalid || Boolean(this.$bad)));
        this.setValidity(this.$bad ? { badInput: true } : (this.required && !ok ? { valueMissing: true } : {}), this.$bad ? 'Enter a colour like #4a90e2.' : 'Choose a colour.', hex);
        this.setFormValue(ok ?? this.value);
    }
    onReset() { this.value = this.$initial ?? ''; this.$bad = false; this.$typing = false; }
    onRestore(state) { this.value = state ?? ''; }
    focus(o) { this.part('control').focus(o); }
};
