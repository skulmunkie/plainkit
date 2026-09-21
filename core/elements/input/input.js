export const flagsOf = v => { const o = {}; for (const k in v) o[k] = v[k]; return o; };

export function parseMoney(text) {
    const t = String(text ?? '').trim();
    if (!t) return null;
    const negative = /^\(.*\)$/.test(t) || t.includes('-');
    const digits = t.replace(/[^0-9.]/g, '');
    if (!/\d/.test(digits) || digits.split('.').length > 2) return null;
    const n = Number(digits);
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

export default Base => class extends Base {
    connected() {
        if (this.$init) return;
        this.$init = true; this.$initial = this.value;
        const i = this.part('control');
        i.addEventListener('input', () => this.fromInner());
        i.addEventListener('change', () => this.fire(['change']));
        i.addEventListener('focus', () => this.edit(true));
        i.addEventListener('blur', () => this.edit(false));
        i.addEventListener('keydown', e => this.keys(e));
        for (const [p, fn] of [['clear', () => this.clear()], ['reveal', () => this.showText(!this.$rev)], ['step-down', () => this.stepBy(-1)], ['step-up', () => this.stepBy(1)]]) this.part(p).addEventListener('click', fn);
    }
    money() { return this.format === 'money'; }
    n() { return this.value === '' ? NaN : Number(this.value); }
    show() { if (this.$badMoney) return this.part('control').value; if (this.money() && !this.$editing && this.value !== '') return formatMoney(Number(this.value), { decimals: this.decimals, locale: this.locale }); return this.value; }
    updated() {
        const i = this.part('control');
        i.type = this.$rev || this.money() ? 'text' : this.type;
        if (this.money()) i.inputMode = 'decimal';
        i.placeholder = this.floating ? ' ' : this.placeholder;
        const s = this.show();
        if (!this.$typing && i.value !== s) i.value = s;
        this.$typing = false;
        this.toggleAttribute('has-value', this.value !== '');
        if (this.money()) { let c = ''; try { c = new Intl.NumberFormat(this.locale, { style: 'currency', currency: this.currency }).formatToParts(0).find(p => p.type === 'currency').value; } catch { this.warnOnce('c', 'bad currency'); } this.part('currency').textContent = c; }
        if (this.stepper) { this.part('step-down').disabled = this.disabled || this.n() <= num(this.min, -Infinity); this.part('step-up').disabled = this.disabled || this.n() >= num(this.max, Infinity); }
        this.check();
    }
    check() {
        const i = this.part('control');
        if (this.money()) { i.setCustomValidity(moneyProblem(this.$badMoney ? null : this.n(), this.$badMoney ? 'x' : this.value, num(this.min), num(this.max))); }
        this.setValidity(flagsOf(i.validity), i.validationMessage, i);
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
        if (this.money()) { const i = this.part('control'); if (on && this.value !== '') { i.value = String(Number(this.value)); i.select(); } this.requestUpdate(); }
    }
    fire(types = ['input', 'change']) { for (const t of types) this.dispatchEvent(new Event(t, { bubbles: true, composed: true })); this.emit('pk-value-change', { value: this.value }); }
    clear() { const i = this.part('control'); i.value = ''; this.value = ''; this.$badMoney = false; i.focus(); this.fire(); this.search(true); }
    stepBy(dir) {
        this.value = String(stepValue(this.n(), num(this.step, 1), dir, num(this.min, -Infinity), num(this.max, Infinity)));
        this.part('control').value = this.show(); this.fire();
    }
    showText(on) {
        this.$rev = on;
        const b = this.part('reveal'); b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', on ? 'Hide password' : 'Show password');
        clearTimeout(this.$hide);
        if (on && this.autohide > 0) this.$hide = setTimeout(() => this.showText(false), this.autohide * 1000);
        this.requestUpdate();
    }
    search(now) {
        if (this.type !== 'search') return;
        clearTimeout(this.$t);
        const send = () => this.emit('pk-search', { value: this.value });
        if (!now && this.debounce > 0) this.$t = setTimeout(send, this.debounce); else send();
    }
    keys(e) {
        if (this.type !== 'search') return;
        if (e.key === 'Escape' && this.value !== '') { e.preventDefault(); e.stopPropagation(); this.clear(); }
        else if (e.key === 'Enter') this.search(true);
    }
    onReset() { this.value = this.$initial ?? ''; this.$badMoney = false; }
    onRestore(state) { this.value = state ?? ''; }
};
