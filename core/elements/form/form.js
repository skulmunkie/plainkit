// pk-form behaviour: constraint-validation UX for the slotted <form>. The browser decides what is invalid; this shows it in the fields (pk-field messages, aria-invalid),
// lists it in a summary, moves focus to the first problem and re-checks as the user fixes things. Form controls (native or pk-*) are found through form.elements.
import { messageFor } from '../../js/validation.js';
// '' when the control is valid; otherwise its data-msg-<constraint>, else data-msg, else the browser's own text (js/validation.js, shared with pk-field-group).
export { messageFor };
// The name a summary item starts with: the enclosing pk-field's label, else the control's label / aria-label / label attribute, else its name or id, else its tag and position (so two anonymous controls never read the same).
export function nameFor(control, index = 0) {
    const text = v => (typeof v === 'string' ? v.trim() : '');
    const at = k => text(control.getAttribute?.(k));
    return text(control.closest?.('pk-field')?.label) || text(control.label) || at('aria-label') || at('label') || text(control.name) || at('name') || at('id') || `${control.localName ?? 'field'} ${index + 1}`;
}
export const checkable =c => c.internals?.willValidate ?? c.willValidate ?? true ? !c.disabled && c.type !== 'hidden' && c.type !== 'submit' && c.type !== 'button' && c.type !== 'reset' && c.localName !== 'fieldset' && c.localName !== 'pk-button' : false;
// Whether a check should run for this event: mode is blur (after leaving, and on submit), input (while typing) or submit (only on submit); a field already showing an error re-checks as you type.
export const shouldCheck = (mode, event, showing) => (event === 'input' && (mode === 'input' || showing)) || (event === 'blur' && mode !== 'submit');

// A form-associated element that holds controls of its own (pk-field-group): it lists its own problems, shows its own messages and re-checks one field.
const isGroup = c => typeof c.problems === 'function' && typeof c.report === 'function';

export default Base => class extends Base {
    connected() {
        if (this.$init) return;
        this.$init = true;
        this.watchSlot('', () => { const f = this.form_(); if (f) f.noValidate = true; });
        this.addEventListener('submit', e => this.submit(e));
        this.addEventListener('focusout', e => this.live(e, 'blur'));
        this.addEventListener('input', e => this.live(e, 'input'));
        this.addEventListener('reset', e => this.reset(e));
        const f = this.form_(); if (f) f.noValidate = true;
    }
    disconnected() { clearTimeout(this.$rt); }
    form_() { return this.slotted().find(e => e.localName === 'form') ?? this.querySelector('form'); }
    controls() { const f = this.form_(); return f ? Array.from(f.elements).filter(checkable) : []; }
    show(control, message) {
        const field = control.closest('pk-field');
        if (field) field.error = message;
        else if ('invalid' in control) control.invalid = Boolean(message);
        else if (message) control.setAttribute('aria-invalid', 'true'); else control.removeAttribute('aria-invalid');
        if (!message && this.showValid && 'valid' in control) control.valid = String(control.value ?? '') !== '';
    }
    // A form-associated element that holds controls of its own (pk-field-group) answers problems(), report(on) and checkField(which): pk-form looks through it.
    check(control) {
        if (isGroup(control)) { control.report(true); return control.problems().length === 0; }
        const m = messageFor(control); this.show(control, m); return !m;
    }
    live(e, kind) {
        const path = e.composedPath();
        const group = this.controls().find(c => isGroup(c) && path[0] !== c && path.includes(c));
        if (group) { // the event came from inside the group: the control is the child of a pk-field in the group's own shadow tree
            const t = path.find(n => n.getRootNode?.() === group.shadowRoot && n.parentNode?.localName === 'pk-field');
            if (t && shouldCheck(this.validate, kind, group.showsError?.(t))) queueMicrotask(() => group.checkField(t));
            return;
        }
        const c = e.target.closest?.('pk-input, pk-textarea, pk-select, pk-checkbox, pk-combobox, pk-tag-input, pk-otp-input, pk-range, pk-colour-input, pk-unit-input, pk-dropzone, pk-radio-group, pk-switch, input, select, textarea');
        if (!c || !this.controls().includes(c)) return;
        const showing = Boolean(c.closest('pk-field')?.error);
        if (shouldCheck(this.validate, kind, showing)) queueMicrotask(() => this.check(c));
    }
    // Every problem of the form, in order: one per invalid control, and one per invalid field of a group. { control, name, message, focus }.
    collect() {
        const out = [];
        for (const [i, c] of this.controls().entries()) {
            if (this.check(c)) continue;
            if (isGroup(c)) for (const p of c.problems()) out.push({ control: c, key: p.key, name: p.label, message: p.message, focus: p.focus });
            else out.push({ control: c, key: c.getAttribute('name') ?? '', name: nameFor(c, i), message: messageFor(c), focus: () => c.focus() });
        }
        return out;
    }
    submit(e) {
        const problems = this.collect();
        this.summarise(problems);
        if (!problems.length) { this.emit('pk-valid', null); return; }
        e.preventDefault();
        problems[0].focus();
        this.emit('pk-invalid', { count: problems.length, controls: [...new Set(problems.map(p => p.control))], messages: problems.map(p => p.message), problems: problems.map(({ key, name, message }) => ({ key, label: name, message })) });
    }
    summarise(problems) {
        const box = this.part('summary'); const list = this.part('summary-list');
        list.replaceChildren();
        box.hidden = !this.summary || problems.length === 0;
        for (const p of problems) {
            const li = document.createElement('li'); const a = document.createElement('a');
            a.textContent = `${p.name}: ${p.message}`; a.setAttribute('role', 'link'); a.tabIndex = 0;
            a.addEventListener('click', () => p.focus());
            a.addEventListener('keydown', ev => { if (ev.key === 'Enter') p.focus(); });
            li.append(a); list.append(li);
        }
    }
    // The reset event fires before the controls take their initial values, so pk-reset waits for the task to end (and is dropped when the reset was cancelled).
    reset(e) { for (const c of this.controls()) { if (isGroup(c)) c.report(false); else this.show(c, ''); } this.summarise([]); if (e) { clearTimeout(this.$rt); this.$rt = setTimeout(() => { if (!e.defaultPrevented) this.emit('pk-reset', null, { cancelable: false }); }, 0); } }
    validateAll() { const problems = this.collect(); this.summarise(problems); return problems.length === 0; }
};
