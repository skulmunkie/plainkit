// pk-textarea behaviour: a multi-line control that can grow with its content up to a cap (CSS field-sizing where supported, a resize on input elsewhere).
export const flagsOf = v => { const o = {}; for (const k in v) o[k] = v[k]; return o; };
// The height a textarea should take: its content height plus its borders, capped at maxHeight (0 = no cap).
export const autogrowHeight = (scrollHeight, borderY, maxHeight = 0) => { const h = scrollHeight + borderY; return maxHeight > 0 ? Math.min(h, maxHeight) : h; };

export default Base => class extends Base {
    connected() {
        if (this.$init) return;
        this.$init = true; this.$initial = this.value;
        const t = this.part('control');
        t.addEventListener('input', () => { this.$typing = true; this.value = t.value; this.fit(); });
        t.addEventListener('change', () => { this.dispatchEvent(new Event('change', { bubbles: true, composed: true })); this.emit('pk-value-change', { value: this.value }); });
    }
    fit() {
        const t = this.part('control');
        if (!this.autogrow || CSS.supports('field-sizing', 'content')) return;
        t.style.height = 'auto';
        t.style.height = `${autogrowHeight(t.scrollHeight, t.offsetHeight - t.clientHeight, this.maxHeight)}px`;
    }
    updated() {
        const t = this.part('control');
        if (!this.$typing && t.value !== this.value) t.value = this.value;
        this.$typing = false;
        if (this.maxHeight > 0) this.style.setProperty('--pk-textarea-max-height', `${this.maxHeight}px`); else this.style.removeProperty('--pk-textarea-max-height');
        this.fit();
        this.setValidity(flagsOf(t.validity), t.validationMessage, t);
        this.setFormValue(this.value);
    }
    onReset() { this.value = this.$initial ?? ''; }
    onRestore(state) { this.value = state ?? ''; }
    focus(o) { this.part('control').focus(o); }
    select() { this.part('control').select(); }
};
