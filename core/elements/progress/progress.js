// <pk-progress> behaviour and its pure logic: percentages, segment widths and warning levels.

// value out of max as a whole-number percentage clamped to 0..100 (0 when max is not positive).
export const percent = (value, max = 100) => (max > 0 ? Math.round(Math.min(1, Math.max(0, value / max)) * 100) : 0);

// Segments as widths that add up to exactly `total`: [{ start, width }] for the rects of a segmented bar; values are proportional.
export function segments(values, total = 100) {
    const sum = values.reduce((a, v) => a + Math.max(0, v), 0);
    if (!sum) return values.map(() => ({ start: 0, width: 0 }));
    const r1 = n => Math.round(n * 10) / 10;
    const widths = values.map(v => r1((Math.max(0, v) / sum) * total));
    const starts = widths.map((_, i) => r1(widths.slice(0, i).reduce((a, b) => a + b, 0)));
    // The last slice takes the rounding remainder so the bar always fills exactly.
    return widths.map((w, i) => ({ start: starts[i], width: i === widths.length - 1 ? r1(total - starts[i]) : w }));
}

// Which colour step a value falls in, for a bar that turns amber then red: 'ok' | 'warn' | 'danger' (thresholds in percent).
export const levelFor = (pct, warn = 70, danger = 90) => (pct >= danger ? 'danger' : pct >= warn ? 'warn' : 'ok');

// "70,90" -> [70, 90]; null when it is not two numbers.
export const thresholds = text => { const t = String(text).split(',').map(Number); return t.length === 2 && t.every(n => !Number.isNaN(n)) ? t : null; };

export default Base => class extends Base {
    updated() {
        const bar = this.part('bar');
        bar.max = this.max;
        if (this.indeterminate) bar.removeAttribute('value'); else bar.value = this.value;
        const pct = percent(this.value, this.max);
        this.part('value').textContent = `${pct}%`;
        const t = thresholds(this.levelThresholds);
        if (t && !this.indeterminate) this.dataset.level = levelFor(pct, t[0], t[1]); else delete this.dataset.level;
    }
};
