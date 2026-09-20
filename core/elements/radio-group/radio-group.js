// pk-radio-group behaviour: one choice from a few options, as radios or as a segmented bar. The options are the element's own <option> children (value, disabled, text);
// the radios are native inputs in one shadow root, so arrow keys, one tab stop and grouping are the browser's.
let serial = 0;
// The options a list of <option>-like nodes describe.
export const optionsOf = nodes => nodes.filter(n => n.localName === 'option').map(n => ({ value: n.getAttribute('value') ?? n.textContent.trim(), label: n.textContent.trim(), disabled: n.hasAttribute('disabled') }));

export default Base => class extends Base {
    connected() {
        if (this.$init) return;
        this.$init = true; this.$initial = this.value;
        const build = () => { this.$opts = true; this.requestUpdate(); };
        this.watchSlot('', build);
        this.$obs = new MutationObserver(build);
        this.$obs.observe(this, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['value', 'disabled'] });
        this.part('group').addEventListener('change', e => {
            this.$typing = true; this.value = e.target.value;
            this.dispatchEvent(new Event('change', { bubbles: true, composed: true })); this.emit('pk-value-change', { value: this.value });
        });
        this.$opts = true;
    }
    disconnected() { this.$obs?.disconnect(); this.$init = false; }
    updated() {
        this.$uid ??= `rg${++serial}`;
        const g = this.part('group');
        if (this.$opts ?? true) {
            this.$opts = false;
            g.replaceChildren(...optionsOf([...this.children]).map(o => {
                const l = this.shadowRoot.querySelector('template').content.firstElementChild.cloneNode(true);
                const i = l.querySelector('input'); i.name = this.$uid; i.value = o.value; i.disabled = o.disabled || this.disabled;
                l.querySelector('span').textContent = o.label; return l;
            }));
        }
        const inputs = [...g.querySelectorAll('input')];
        for (const i of inputs) { i.checked = i.value === this.value && this.value !== ''; i.disabled = i.disabled || this.disabled; }
        this.$typing = false;
        this.setValidity(this.required && this.value === '' ? { valueMissing: true } : {}, 'Choose an option.', inputs[0]);
        this.setFormValue(this.value === '' ? null : this.value);
    }
    onReset() { this.value = this.$initial ?? ''; }
    onRestore(state) { this.value = state ?? ''; }
    focus(o) { (this.part('group').querySelector('input:checked') ?? this.part('group').querySelector('input:not(:disabled)'))?.focus(o); }
};
