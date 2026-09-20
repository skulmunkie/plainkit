// pk-field behaviour: the label, help, error, warning and counter around a slotted control, and the wiring between them. Ids do not cross shadow roots, so the field
// hands its label and its help and error text to the control as properties (label, description, invalid, warning, required) and the control puts them on its inner element.
export const counterText = (length, max) => (max > 0 ? `${length} / ${max}` : String(length));
// 'ok' | 'near' (from 90% of the max) | 'over'.
export function counterState(length, max) {
    if (!(max > 0)) return 'ok';
    if (length > max) return 'over';
    return length >= max * 0.9 ? 'near' : 'ok';
}
export const describe = (...parts) => parts.filter(Boolean).join(' ');

export default Base => class extends Base {
    connected() {
        if (this.$init) return;
        this.$init = true;
        this.watchSlot('', () => this.wire());
        this.addEventListener('input', () => this.count());
        this.part('label').addEventListener('click', () => this.control()?.focus());
    }
    control() { return this.slotted().find(e => e.localName.startsWith('pk-') || ['input', 'select', 'textarea'].includes(e.localName)) ?? null; }
    updated() { this.wire(); }
    wire() {
        const c = this.control();
        if (!c) return;
        const mine = c.$fieldLabel ?? '';
        if ('label' in c) { if (!c.label || c.label === mine) { c.label = this.label; c.$fieldLabel = this.label; } } else if (this.label && !c.getAttribute('aria-label')) c.setAttribute('aria-label', this.label);
        if (this.required && 'required' in c) c.required = true;
        const text = describe(this.help, this.error, this.warning);
        if ('description' in c) c.description = text; else if (text) c.setAttribute('aria-description', text); else c.removeAttribute('aria-description');
        if ('invalid' in c) { this.flag(c, 'invalid', Boolean(this.error)); this.flag(c, 'warning', Boolean(this.warning) && !this.error); }
        else { c.toggleAttribute('data-invalid', Boolean(this.error)); if (this.error) c.setAttribute('aria-invalid', 'true'); else c.removeAttribute('aria-invalid'); }
        this.count();
    }
    flag(c, name, on) { c.$byField ??= {}; if (on) { c[name] = true; c.$byField[name] = true; } else if (c.$byField[name]) { c[name] = false; c.$byField[name] = false; } }
    count() {
        const c = this.control(); const n = this.part('count');
        if (!c || !(this.max > 0)) n.textContent = '';
        else { const length = String(c.value ?? '').length; n.textContent = counterText(length, this.max); n.dataset.state = counterState(length, this.max); }
        const helpOn = Boolean(this.help) || this.slotted('help').length > 0;
        this.part('label').hidden = !this.label && this.slotted('label').length === 0;
        this.part('help').hidden = !helpOn;
        this.part('foot').hidden = !helpOn && !this.error && !this.warning && n.textContent === '';
    }
};
