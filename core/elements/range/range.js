// pk-range behaviour: a single slider or a dual (minimum and maximum) slider from two native range inputs, with a token-drawn track fill and an optional value output.
export const fraction = (value, min, max) => (max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0);
// Keep low <= high: the thumb that moved stops at the other one.
export const clampPair = (lo, hi, moved) => (moved === 'lo' ? [Math.min(lo, hi), hi] : [lo, Math.max(lo, hi)]);

export default Base => class extends Base {
    connected() {
        if (this.$init) return;
        this.$init = true; this.$initial = [this.value, this.valueLow, this.valueHigh];
        const lo = this.part('control'); const hi = this.part('control-high');
        for (const [el, which] of [[lo, 'lo'], [hi, 'hi']]) {
            el.addEventListener('input', () => this.moved(which));
            el.addEventListener('change', () => { this.dispatchEvent(new Event('change', { bubbles: true, composed: true })); this.emit('pk-range', this.detail()); });
        }
    }
    detail() { return { value: this.dual ? this.valueLow : this.value, low: this.valueLow, high: this.valueHigh }; }
    moved(which) {
        const lo = this.part('control'); const hi = this.part('control-high');
        if (this.dual) { const [a, b] = clampPair(Number(lo.value), Number(hi.value), which); this.$typing = true; this.valueLow = a; this.valueHigh = b; lo.value = String(a); hi.value = String(b); this.$top = which === 'lo' ? lo : hi; }
        else { this.$typing = true; this.value = Number(lo.value); }
        this.paint();
        this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    }
    paint() {
        const min = this.min; const max = this.max;
        if (this.dual) { this.style.setProperty('--lo', String(fraction(this.valueLow, min, max))); this.style.setProperty('--hi', String(fraction(this.valueHigh, min, max))); }
        else this.style.setProperty('--f', String(fraction(this.value, min, max)));
        this.part('output').textContent = this.dual ? `${this.valueLow} to ${this.valueHigh}` : String(this.value);
        this.part('control').classList.toggle('top', this.$top === this.part('control')); this.part('control-high').classList.toggle('top', this.$top === this.part('control-high'));
    }
    updated() {
        const lo = this.part('control'); const hi = this.part('control-high');
        if (!this.$typing) { lo.value = String(this.dual ? this.valueLow : this.value); hi.value = String(this.valueHigh); }
        this.$typing = false;
        if (this.dual) { lo.setAttribute('aria-label', `${this.label || 'Range'} minimum`); hi.setAttribute('aria-label', `${this.label || 'Range'} maximum`); }
        this.paint();
        if (this.dual) { const fd = new FormData(); fd.append(this.name, String(this.valueLow)); fd.append(this.name, String(this.valueHigh)); this.setFormValue(fd); } else this.setFormValue(String(this.value));
    }
    onReset() { [this.value, this.valueLow, this.valueHigh] = this.$initial; }
    focus(o) { this.part('control').focus(o); }
};
