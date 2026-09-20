// pk-select behaviour: the browser's select in a token skin. The options are the element's own <option> and <optgroup> children, cloned into the inner select.
export const flagsOf = v => { const o = {}; for (const k in v) o[k] = v[k]; return o; };
// The selected values of a select-like list of {value, selected} options.
export const selectedValues = options => options.filter(o => o.selected).map(o => o.value);

export default Base => class extends Base {
    connected() {
        if (this.$init) return;
        this.$init = true; this.$initial = this.value;
        const s = this.part('control');
        this.watchSlot('', () => { this.$opts = true; this.requestUpdate(); });
        this.$obs = new MutationObserver(() => { this.$opts = true; this.requestUpdate(); });
        this.$obs.observe(this, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['value', 'selected', 'disabled', 'label'] });
        s.addEventListener('change', () => { this.$typing = true; this.value = this.multiple ? selectedValues([...s.options]).join(',') : s.value; this.dispatchEvent(new Event('change', { bubbles: true, composed: true })); this.emit('pk-value-change', { value: this.value }); });
        s.addEventListener('input', () => this.dispatchEvent(new Event('input', { bubbles: true, composed: true })));
        this.$opts = true;
    }
    disconnected() { this.$obs?.disconnect(); this.$init = false; }
    updated() {
        const s = this.part('control');
        s.multiple = this.multiple;
        if (this.$opts ?? true) { this.$opts = false; s.replaceChildren(...[...this.children].filter(c => c.localName === 'option' || c.localName === 'optgroup').map(c => c.cloneNode(true))); this.$pushed = false; }
        if (!this.$typing) {
            const wanted = this.multiple ? this.value.split(',') : [this.value];
            if ([...s.options].some(o => wanted.includes(o.value))) for (const o of s.options) o.selected = wanted.includes(o.value);
            this.$pushed = true;
        }
        this.$typing = false;
        if (this.value === '' && s.options.length && !this.multiple) { const first = s.options[s.selectedIndex]; if (first) this.$auto = first.value; }
        this.setValidity(flagsOf(s.validity), s.validationMessage, s);
        if (this.multiple) { const fd = new FormData(); for (const v of selectedValues([...s.options])) fd.append(this.name, v); this.setFormValue(fd); } else this.setFormValue(s.value);
    }
    onReset() { this.value = this.$initial ?? ''; this.$pushed = false; }
    onRestore(state) { this.value = typeof state === 'string' ? state : this.value; this.$pushed = false; }
    focus(o) { this.part('control').focus(o); }
};
