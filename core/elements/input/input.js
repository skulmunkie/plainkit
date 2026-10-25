export const flagsOf = v => { const o = {}; for (const k in v) o[k] = v[k]; return o; };

export function parseMoney(text) {
    const t = String(text ?? '').trim();
    if (!t) return null;
    const negative = /^\(.*\)$/.test(t) || t.includes('-');
    const digits = t.replace(/[^0-9.]/g, '');
    const n = Number(digits);      // only digits and dots are left: no digit at all is '', a second dot is NaN
    if (!digits || isNaN(n)) return null;
    return negative ? -n : n;
}
export const formatMoney = (n, { decimals = 2, group = true, locale = 'en-US' } = {}) => n.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: group });
export function moneyProblem(n, text, min, max) {
    if (String(text ?? '').trim() === '') return '';
    if (n === null) return 'Enter an amount.';
    if (min !== null && n < min) return `At least ${formatMoney(min)}.`;
    if (max !== null && n > max) return `At most ${formatMoney(max)}.`;
    return '';
}
const decimalsOf = n => (String(n).split('.')[1] ?? '').length;
export function stepValue(current, step, direction, min = -Infinity, max = Infinity) {
    const s = step > 0 ? step : 1;
    const base = Number.isFinite(current) ? current : 0;
    return Math.min(max, Math.max(min, Number((base + direction * s).toFixed(Math.max(decimalsOf(s), decimalsOf(base))))));
}
const num = (s, d = null) => (s === '' || isNaN(s) ? d : Number(s));

// True once on the clipboard; false when unavailable (a missing clipboard throws inside the try) or refused. Never throws.
export async function copyValue(text, clip = globalThis.navigator?.clipboard) {
    try { await clip.writeText(text); return true; } catch { return false; }
}

export default Base => class extends Base {
    connected() {
        if (this.$init) return;
        this.$init = true; this.$initial = this.value;
        const i = this.part('control');
        i.addEventListener('input', () => this.fromInner());
        i.addEventListener('change', () => this.fire(['change']));
        i.addEventListener('focus', () => { this.edit(true); if (this.selectOnFocus) { this.$sel = true; i.select(); } });
        i.addEventListener('mouseup', e => { if (this.$sel) { e.preventDefault(); this.$sel = false; } });
        i.addEventListener('blur', () => this.edit(false));
        i.addEventListener('keydown', e => this.keys(e));
        for (const [p, fn] of [['clear', () => this.clear()], ['reveal', () => this.showText(!this.$rev)], ['copy', () => this.copy()], ['step-down', () => this.stepBy(-1)], ['step-up', () => this.stepBy(1)]]) this.part(p).addEventListener('click', fn);
    }
    money() { return this.format === 'money'; }
    n() { return Number(this.value || NaN); }
    show() { if (this.$badMoney) return this.part('control').value; if (this.money() && !this.$editing && this.value) return formatMoney(this.n(), { decimals: this.decimals, locale: this.locale }); return this.value; }
    updated() {
        // width: xs to 2xl (4 to 24rem) or a CSS length, set as the host's inline-size; an unknown word is ignored by the browser.
        const w = this.width, r = { xs: 4, sm: 6, md: 8, lg: 12, xl: 16, '2xl': 24 }[w]; this.style.inlineSize = r ? r + 'rem' : w;
        const i = this.part('control');
        i.type = this.$rev || this.money() ? 'text' : this.type;
        if (this.money()) i.inputMode = 'decimal';
        i.placeholder = this.floating ? ' ' : this.placeholder;
        const s = this.show();
        if (!this.$typing && i.value !== s) i.value = s;
        this.$typing = false;
        this.toggleAttribute('has-value', !!this.value);
        if (this.money()) { let c = ''; try { c = new Intl.NumberFormat(this.locale, { style: 'currency', currency: this.currency }).formatToParts(0).find(p => p.type === 'currency').value; } catch { this.warnOnce('c', 'bad currency'); } this.part('currency').textContent = c; }
        if (this.stepper) { this.part('step-down').disabled = this.disabled || this.n() <= num(this.min, -Infinity); this.part('step-up').disabled = this.disabled || this.n() >= num(this.max, Infinity); }
        if (this.copyable) this.part('copy').disabled = this.disabled || !this.value;
        // A combobox: the listbox lives in the host's tree, which the inner input reaches through element reflection (an older browser just ignores the two element references).
        const l = this.listbox;
        i.role = l && 'combobox'; i.ariaExpanded = l && '' + !l.hidden; i.ariaAutoComplete = l && 'list';
        i.ariaControlsElements = l && [l]; i.ariaActivedescendantElement = l && l.querySelector('[aria-selected=true]');
        this.check();
    }
    check() {
        const i = this.part('control');
        if (this.money()) { i.setCustomValidity(moneyProblem(this.$badMoney ? null : this.n(), this.$badMoney ? 'x' : this.value, num(this.min), num(this.max))); }
        this.setValidity(i.willValidate ? flagsOf(i.validity) : {}, i.validationMessage, i);
        this.setFormValue(this.value);
    }
    fromInner() {
        const raw = this.part('control').value;
        this.$typing = true; this.$badMoney = false;
        let v = raw;
        if (this.money()) { const n = parseMoney(raw); this.$badMoney = raw.trim() !== '' && n === null; v = n === null ? '' : String(n); }
        this.value = v;
        this.search(false);
    }
    edit(on) {
        this.$editing = on;
        if (this.money()) { const i = this.part('control'); if (on && this.value) { i.value = +this.value; i.select(); } this.requestUpdate(); }
    }
    fire(types = ['input', 'change']) { for (const t of types) this.dispatchEvent(new Event(t, { bubbles: true, composed: true })); this.emit('pk-value-change', { value: this.value }); }
    clear() { const i = this.part('control'); i.value = ''; this.value = ''; this.$badMoney = false; i.focus(); this.fire(); this.search(true); }
    stepBy(dir) {
        this.value = '' + (stepValue(this.n(), num(this.step, 1), dir, num(this.min, -Infinity), num(this.max, Infinity)));
        this.part('control').value = this.show(); this.fire();
    }
    showText(on) {
        this.$rev = on;
        const b = this.part('reveal'); b.ariaPressed = '' + on; b.ariaLabel = on ? 'Hide password' : 'Show password';
        clearTimeout(this.$hide);
        if (on && this.autohide > 0) this.$hide = setTimeout(() => this.showText(false), this.autohide * 1000);
        this.requestUpdate();
    }
    async copy() {
        if (!this.value) return;
        if (!(await copyValue(this.value))) return this.log.warn('copy failed');
        const b = this.part('copy'); b.ariaLabel = 'Copied';
        clearTimeout(this.$copyT); this.$copyT = setTimeout(() => b.ariaLabel = 'Copy', 1600);
    }
    search(now) {
        if (this.type !== 'search') return;
        clearTimeout(this.$t);
        const send = () => this.emit('pk-search', { value: this.value });
        // #1769: with search-on="enter" typing never searches; Enter and clear (now) do.
        if (now) send(); else if (this.searchOn !== 'enter') { if (this.debounce > 0) this.$t = setTimeout(send, this.debounce); else send(); }
    }
    keys(e) {
        if (this.type !== 'search') return;
        if (e.key === 'Escape' && this.value) { e.preventDefault(); e.stopPropagation(); this.clear(); }
        else if (e.key === 'Enter') this.search(true);
    }
    onReset() { this.value = this.$initial ?? ''; this.$badMoney = false; }
    onRestore(state) { this.value = state ?? ''; }
};
