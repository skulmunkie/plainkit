import { syncDialog, wireDialog, requestClose } from '../../js/menu-logic.js';

// Dialog logic: the confirm, alert and prompt patterns' decisions. Pure, so it can be tested without a DOM.
// House rule: the backdrop never closes a dialog; every dialog offers its own Cancel or Close.
export const SIZES = ['sm', 'md', 'lg', 'xl', 'fullscreen'];
export const normalizeSize = s => (SIZES.includes(s) ? s : 'md');

// What a pattern resolves to from the button that closed it ("ok", "cancel", "" for Escape) and the field text.
export function outcome(kind, returnValue, text = '') {
    const ok = returnValue === 'ok';
    if (kind === 'confirm') return ok;
    if (kind === 'prompt') return ok ? text : null;
    return undefined;
}

// Prompt validation: an error message, or '' when accepted. A user pattern that is long or could backtrack badly is refused, not run.
export function promptProblem(value, { required = false, maxLength = Infinity, pattern = '', message = 'Enter a valid value.' } = {}) {
    const v = value.trim();
    if (required && !v) return 'This field is required.';
    if (v.length > maxLength) return `Use at most ${maxLength} characters.`;
    if (pattern) {
        if (pattern.length > 200 || /\([^)]*[+*][^)]*\)[+*{]/.test(pattern)) return message;
        try { if (!new RegExp(pattern).test(v)) return message; } catch { return message; }
    }
    return '';
}

// A destructive confirm makes the safe answer the default: focus lands on Cancel.
export const initialFocus = (kind, danger) => (kind === 'confirm' && danger ? 'cancel' : kind === 'prompt' ? 'input' : 'ok');

const btn = (label, variant, action) => {
    const b = document.createElement('pk-button'); b.slot = 'footer'; b.setAttribute('variant', variant); b.dataset.result = action; b.textContent = label; return b;
};

// PkDialog.confirm / alert / prompt: build a dialog, open it, resolve a promise when it closes.
function ask(kind, o = {}) {
    return new Promise(resolve => {
        const d = document.createElement('pk-dialog');
        d.heading = o.heading ?? ''; d.size = 'sm';
        if (o.message) { const p = document.createElement('p'); p.textContent = o.message; d.append(p); }
        let input; let error;
        if (kind === 'prompt') {
            input = document.createElement('input'); input.type = 'text'; input.value = o.value ?? ''; input.placeholder = o.placeholder ?? ''; input.setAttribute('aria-label', o.label ?? o.heading ?? 'Value');
            error = document.createElement('p'); error.setAttribute('role', 'alert'); error.className = 'form-error'; error.hidden = true;
            d.append(input, error);
        }
        if (kind !== 'alert') d.append(btn(o.cancelLabel ?? 'Cancel', 'ghost', 'cancel'));
        d.append(btn(o.confirmLabel ?? (kind === 'confirm' ? 'Confirm' : 'OK'), o.danger ? 'warn' : 'primary', 'ok'));
        const state = { result: '' };
        d.addEventListener('click', e => {
            const r = e.target.closest?.('[data-result]')?.dataset.result;
            if (!r) return;
            if (r === 'ok' && input) { const problem = promptProblem(input.value, o); if (problem) { error.textContent = problem; error.hidden = false; return; } }
            state.result = r; d.open = false;
        });
        input?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); d.querySelector('[data-result="ok"]').click(); } });
        d.addEventListener('close', () => { const text = input?.value ?? ''; d.remove(); resolve(outcome(kind, state.result, text.trim())); });
        document.body.append(d);
        d.open = true;
        const want = initialFocus(kind, o.danger);
        requestAnimationFrame(() => (want === 'input' ? input : d.querySelector(`[data-result="${want}"]`))?.focus());
    });
}

export default Base => class extends Base {
    static confirm(o) { return ask('confirm', o); }
    static alert(o) { return ask('alert', o); }
    static prompt(o) { return ask('prompt', o); }
    connected() {
        const dlg = this.part('dialog');
        if (!this.$w) { this.$w = true; wireDialog(this, dlg); globalThis.PkDialog ??= this.constructor; }
        syncDialog(this, dlg);
    }
    disconnected() { const d = this.part('dialog'); if (d.open) d.close(); }
    changed(name) {
        if (name === 'open') syncDialog(this, this.part('dialog'));
        else if (name === 'maxWidth') { if (this.maxWidth > 0) this.style.setProperty('--pk-dialog-w', `min(${this.maxWidth}px, calc(100vw - 2rem))`); else this.style.removeProperty('--pk-dialog-w'); }
    }
    show() { this.open = true; }
    hide() { if (requestClose(this, 'method')) this.open = false; }
};
