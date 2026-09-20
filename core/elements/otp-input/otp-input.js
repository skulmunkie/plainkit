// pk-otp-input behaviour: a one-time code or PIN as a row of single-character cells. Typing advances, Backspace in an empty cell steps back, arrows/Home/End move, and a pasted or
// autofilled whole code spreads across the cells. The pure helpers are exported for the Node tests.
export function sanitize(text, kind = 'numeric') {
    const s = String(text ?? '');
    return kind === 'any' ? s.replace(/\s/g, '') : s.replace(kind === 'alnum' ? /[^A-Za-z0-9]/g : /\D/g, '');
}
// Spread a code over `count` cells starting at `start`: the characters that fit.
export const distribute = (code, count, start = 0) => Array.from(code).slice(0, Math.max(0, count - start));

export default Base => class extends Base {
    connected() {
        if (this.$init) return;
        this.$init = true; this.$initial = this.value;
        const g = this.part('group');
        g.addEventListener('input', e => { const i = this.cells().indexOf(e.target); if (i < 0) return; const t = e.target.value; e.target.value = ''; this.fill(i, t); e.stopPropagation(); });
        g.addEventListener('paste', e => { const i = this.cells().indexOf(e.target); if (i < 0) return; e.preventDefault(); this.fill(i, e.clipboardData?.getData('text') ?? ''); });
        g.addEventListener('keydown', e => this.key(e));
        g.addEventListener('focusin', e => e.target.select?.());
    }
    cells() { return [...this.part('group').querySelectorAll('input')]; }
    fill(index, text) {
        const cells = this.cells();
        const chars = distribute(sanitize(text, this.type), cells.length, index);
        chars.forEach((ch, n) => { cells[index + n].value = ch; });
        (cells[Math.min(index + chars.length, cells.length - 1)] ?? cells[index]).focus();
        this.publish();
    }
    publish() {
        const cells = this.cells(); const v = cells.map(c => c.value).join('');
        this.$typing = true; this.value = v;
        this.dispatchEvent(new Event('input', { bubbles: true, composed: true })); this.emit('pk-otp-change', { value: v });
        if (cells.length && cells.every(c => c.value !== '')) { this.dispatchEvent(new Event('change', { bubbles: true, composed: true })); this.emit('pk-otp-complete', { value: v }); }
    }
    key(e) {
        const cells = this.cells(); const i = cells.indexOf(e.target); if (i < 0) return;
        const go = j => { e.preventDefault(); cells[Math.max(0, Math.min(cells.length - 1, j))].focus(); };
        if (e.key === 'Backspace' && e.target.value === '' && i > 0) { go(i - 1); cells[i - 1].value = ''; this.publish(); }
        else if (e.key === 'ArrowLeft') go(i - 1); else if (e.key === 'ArrowRight') go(i + 1);
        else if (e.key === 'Home') go(0); else if (e.key === 'End') go(cells.length - 1);
    }
    updated() {
        const g = this.part('group'); const key = `${this.length}|${this.type}|${this.separatorAt}`;
        if (this.$key !== key) {
            this.$key = key; g.replaceChildren();
            const cell = this.shadowRoot.querySelector('template.cell'); const sep = this.shadowRoot.querySelector('template.sep');
            for (let n = 0; n < this.length; n++) {
                if (this.separatorAt > 0 && n === this.separatorAt) g.append(sep.content.firstElementChild.cloneNode(true));
                const c = cell.content.firstElementChild.cloneNode(true);
                c.setAttribute('aria-label', `Digit ${n + 1} of ${this.length}`);
                c.inputMode = this.type === 'numeric' ? 'numeric' : 'text';
                if (n === 0) c.setAttribute('autocomplete', 'one-time-code');
                g.append(c);
            }
        }
        const cells = this.cells();
        if (!this.$typing) Array.from({ length: cells.length }).forEach((_, n) => { cells[n].value = this.value[n] ?? ''; });
        this.$typing = false;
        cells.forEach(c => { c.disabled = this.disabled; c.required = this.required; c.setAttribute('aria-invalid', String(this.invalid)); });
        this.setValidity(this.required && this.value.length < this.length ? { valueMissing: true } : {}, 'Enter the full code.', cells[0]);
        this.setFormValue(this.value);
    }
    onReset() { this.value = this.$initial ?? ''; }
    onRestore(state) { this.value = state ?? ''; }
    focus(o) { (this.cells().find(c => c.value === '') ?? this.cells()[0])?.focus(o); }
    clear() { this.value = ''; this.focus(); }
};
