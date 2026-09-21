// pk-form behaviour: constraint-validation UX for the slotted <form>. The browser decides what is invalid; this shows it in the fields (pk-field messages, aria-invalid),
// lists it in a summary, moves focus to the first problem and re-checks as the user fixes things. Form controls (native or pk-*) are found through form.elements.
const KEYS = [['valueMissing', 'required'], ['typeMismatch', 'type'], ['patternMismatch', 'pattern'], ['tooShort', 'minlength'], ['tooLong', 'maxlength'], ['rangeUnderflow', 'min'], ['rangeOverflow', 'max'], ['stepMismatch', 'step'], ['badInput', 'bad-input'], ['customError', 'custom']];

// '' when the control is valid; otherwise its data-msg-<constraint>, else data-msg, else the browser's own text.
export function messageFor(control) {
    const v = control.validity;
    if (!v || v.valid !== false) return '';
    const fallback = control.getAttribute('data-msg') ?? control.validationMessage ?? 'Enter a valid value.';
    for (const [flag, key] of KEYS) if (v[flag]) return control.getAttribute(`data-msg-${key}`) ?? fallback;
    return fallback;
}
export const checkable = c => c.internals?.willValidate ?? c.willValidate ?? true ? !c.disabled && c.type !== 'hidden' && c.type !== 'submit' && c.type !== 'button' && c.type !== 'reset' && c.localName !== 'fieldset' && c.localName !== 'pk-button' : false;
// Whether a check should run for this event: mode is blur (after leaving, and on submit), input (while typing) or submit (only on submit); a field already showing an error re-checks as you type.
export const shouldCheck = (mode, event, showing) => (event === 'input' && (mode === 'input' || showing)) || (event === 'blur' && mode !== 'submit');

export default Base => class extends Base {
    connected() {
        if (this.$init) return;
        this.$init = true;
        this.watchSlot('', () => { const f = this.form_(); if (f) f.noValidate = true; });
        this.addEventListener('submit', e => this.submit(e));
        this.addEventListener('focusout', e => this.live(e, 'blur'));
        this.addEventListener('input', e => this.live(e, 'input'));
        this.addEventListener('reset', () => this.reset());
        const f = this.form_(); if (f) f.noValidate = true;
    }
    form_() { return this.slotted().find(e => e.localName === 'form') ?? this.querySelector('form'); }
    controls() { const f = this.form_(); return f ? Array.from(f.elements).filter(checkable) : []; }
    show(control, message) {
        const field = control.closest('pk-field');
        if (field) field.error = message;
        else if ('invalid' in control) control.invalid = Boolean(message);
        else if (message) control.setAttribute('aria-invalid', 'true'); else control.removeAttribute('aria-invalid');
        if (!message && this.showValid && 'valid' in control) control.valid = String(control.value ?? '') !== '';
    }
    check(control) { const m = messageFor(control); this.show(control, m); return !m; }
    live(e, kind) {
        const c = e.target.closest?.('pk-input, pk-textarea, pk-select, pk-checkbox, pk-combobox, pk-tag-input, pk-otp-input, pk-range, pk-colour-input, pk-unit-input, pk-dropzone, pk-radio-group, pk-switch, input, select, textarea');
        if (!c || !this.controls().includes(c)) return;
        const showing = Boolean(c.closest('pk-field')?.error);
        if (shouldCheck(this.validate, kind, showing)) queueMicrotask(() => this.check(c));
    }
    submit(e) {
        const invalid = this.controls().filter(c => !this.check(c));
        this.summarise(invalid);
        if (!invalid.length) { this.emit('pk-valid', null); return; }
        e.preventDefault();
        invalid[0].focus();
        this.emit('pk-invalid', { count: invalid.length, controls: invalid, messages: invalid.map(messageFor) });
    }
    summarise(invalid) {
        const box = this.part('summary'); const list = this.part('summary-list');
        list.replaceChildren();
        box.hidden = !this.summary || invalid.length === 0;
        for (const c of invalid) {
            const li = document.createElement('li'); const a = document.createElement('a');
            a.textContent = messageFor(c); a.setAttribute('role', 'link'); a.tabIndex = 0;
            a.addEventListener('click', () => c.focus());
            a.addEventListener('keydown', ev => { if (ev.key === 'Enter') c.focus(); });
            li.append(a); list.append(li);
        }
    }
    reset() { for (const c of this.controls()) this.show(c, ''); this.summarise([]); }
    validateAll() { const invalid = this.controls().filter(c => !this.check(c)); this.summarise(invalid); return invalid.length === 0; }
};
