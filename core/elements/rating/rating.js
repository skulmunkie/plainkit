// pk-rating behaviour: a whole-star rating from radios (arrow keys, forms and screen readers work as for any radio group); readonly renders the same stars as an image.
let serial = 0;
export const starsOn = (value, index) => index <= value;
export const ratingText = (value, max) => `${value} out of ${max} stars`;

export default Base => class extends Base {
    connected() {
        if (this.$init) return;
        this.$init = true; this.$initial = this.value;
        this.part('group').addEventListener('change', e => { this.value = Number(e.target.value); this.dispatchEvent(new Event('change', { bubbles: true, composed: true })); this.emit('pk-rating-change', { value: this.value }); });
    }
    updated() {
        this.$uid ??= `rt${++serial}`;
        const g = this.part('group');
        const key = `${this.max}|${this.readonly}`;
        if (this.$key !== key) {
            this.$key = key; g.replaceChildren();
            for (let n = 1; n <= this.max; n++) {
                const s = this.shadowRoot.querySelector('template').content.firstElementChild.cloneNode(true); const i = s.querySelector('input');
                if (this.readonly) i.remove(); else { i.name = this.$uid; i.value = String(n); i.setAttribute('aria-label', `${n} star${n === 1 ? '' : 's'}`); }
                g.append(s);
            }
        }
        if (this.readonly) { g.setAttribute('role', 'img'); g.setAttribute('aria-label', ratingText(this.value, this.max)); } else g.setAttribute('role', 'radiogroup');
        [...g.children].forEach((s, i) => { s.classList.toggle('on', starsOn(this.value, i + 1)); const r = s.querySelector('input'); if (r) { r.checked = i + 1 === this.value; r.disabled = this.disabled; } });
        this.setFormValue(this.value ? String(this.value) : null);
    }
    onReset() { this.value = this.$initial; }
    onRestore(state) { this.value = Number(state) || 0; }
    focus(o) { (this.part('group').querySelector('input:checked') ?? this.part('group').querySelector('input'))?.focus(o); }
};
