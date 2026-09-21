// pk-unit-input behaviour: a number and a unit select that make one value such as "1.5rem". The pure rules are exported for the Node tests.
export const flagsOf = v => { const o = {}; for (const k in v) o[k] = v[k]; return o; };
export const DEFAULT_UNITS = ['px', 'rem', 'em', '%'];

// The units a list names: comma or space separated, in order, without duplicates; the default set when it names none.
export function unitList(text) {
    const list = [...new Set(String(text ?? '').split(/[\s,]+/).filter(Boolean))];
    return list.length ? list : DEFAULT_UNITS;
}

// "1.5rem" -> { number: '1.5', unit: 'rem' }; "12" -> { number: '12', unit: '' }; '' -> { number: '', unit: '' }; anything else (auto, calc(...)) -> null.
export function parseUnitValue(text) {
    const t = String(text ?? '').trim();
    if (t === '') return { number: '', unit: '' };
    const m = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-z%]*)$/i.exec(t);
    return m ? { number: m[1], unit: m[2] } : null;
}

// The value a number and a unit make: nothing until there is a number.
export const joinUnitValue = (number, unit) => (String(number ?? '').trim() === '' ? '' : `${number}${unit}`);

// The listed unit that equals a unit ignoring case ("REM" is rem), or null.
export const matchUnit = (units, unit) => units.find(u => u.toLowerCase() === String(unit).toLowerCase()) ?? null;

export default Base => class extends Base {
    connected() {
        if (this.$init) return;
        this.$init = true; this.$initial = this.value;
        const n = this.part('control'), u = this.part('unit');
        n.addEventListener('input', () => { this.$typing = true; this.value = joinUnitValue(n.value, this.unit()); });
        n.addEventListener('change', () => this.fire());
        u.addEventListener('change', () => { this.$unit = u.value; this.value = joinUnitValue(n.value, u.value); this.fire(); });
    }
    unit() { return this.$unit ?? unitList(this.units)[0]; }
    fire() { this.dispatchEvent(new Event('change', { bubbles: true, composed: true })); this.emit('pk-value-change', { value: this.value }); }
    updated() {
        const n = this.part('control'), u = this.part('unit'), units = unitList(this.units);
        const p = parseUnitValue(this.value);
        if (!p) this.warnOnce('v', `value="${this.value}" is not a number with a unit: the number field is left empty`);
        if (p?.unit) this.$unit = matchUnit(units, p.unit) ?? p.unit;
        const unit = this.$unit ?? units[0];
        const list = units.includes(unit) ? units : [...units, unit];
        if (this.$opts !== list.join('|')) { this.$opts = list.join('|'); u.replaceChildren(...list.map(x => { const o = this.ownerDocument.createElement('option'); o.value = o.textContent = x; return o; })); }
        u.value = unit;
        u.disabled = this.disabled || this.readonly;
        u.setAttribute('aria-label', this.label ? `${this.label} unit` : 'Unit');
        const wanted = p ? p.number : '';
        if (!this.$typing && n.value !== wanted) n.value = wanted;
        this.$typing = false;
        this.setValidity(flagsOf(n.validity), n.validationMessage, n);
        this.setFormValue(this.value);
    }
    onReset() { this.value = this.$initial ?? ''; this.$unit = undefined; }
    onRestore(state) { this.value = state ?? ''; this.$unit = undefined; }
    focus(o) { this.part('control').focus(o); }
};
