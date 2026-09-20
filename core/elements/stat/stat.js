// Plainkit stat tile logic: the change between two numbers and how it reads. Pure functions.

// Direction and percentage of a change: { direction: 'up' | 'down' | 'flat', pct } (pct is null when there is no previous value to compare).
export function delta(current, previous, flatBelow = 0.05) {
    if (previous === 0 || previous === null || previous === undefined || Number.isNaN(Number(previous))) return { direction: current > 0 ? 'up' : 'flat', pct: null };
    const pct = ((current - previous) / Math.abs(previous)) * 100;
    return { direction: Math.abs(pct) < flatBelow ? 'flat' : pct > 0 ? 'up' : 'down', pct: Math.round(pct * 10) / 10 };
}

// "+12.5%", "-3%", "0%" ; "New" when there was nothing to compare with.
export function formatDelta({ pct, direction }) {
    if (pct === null) return direction === 'up' ? 'New' : '0%';
    return `${pct > 0 ? '+' : ''}${pct}%`;
}

// Whether a direction is good news. Most metrics are up-is-good; costs and returns are down-is-good (invert = true).
export const isGood = (direction, invert = false) => (direction === 'flat' ? null : (direction === 'up') !== invert);

// The spoken form: "up 12.5 percent versus last month".
export function deltaSpeech({ pct, direction }, versus = 'the previous period') {
    if (pct === null) return `new, nothing to compare with ${versus}`;
    return direction === 'flat' ? `unchanged versus ${versus}` : `${direction} ${Math.abs(pct)} percent versus ${versus}`;
}

// "x,y x,y" for a sparkline scaled to its own min and max in a w by h box.
export function sparkPoints(values, w = 100, h = 24, pad = 2) {
    if (!values.length) return '';
    const min = Math.min(...values), span = Math.max(...values) - min || 1, r1 = n => Math.round(n * 10) / 10;
    return values.map((v, i) => `${r1(values.length === 1 ? w / 2 : pad + (i * (w - 2 * pad)) / (values.length - 1))},${r1(h - pad - ((v - min) / span) * (h - 2 * pad))}`).join(' ');
}

const SVG = 'http://www.w3.org/2000/svg';

export default Base => class extends Base {
    connected() {
        if (this.$c) return;
        this.$c = e => { if (!this.emit('pk-activate', { href: this.href })) e.preventDefault(); };
        this.part('link').addEventListener('click', this.$c);
        this.part('link').addEventListener('keydown', e => { if (this.interactive && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.currentTarget.click(); } });
    }
    updated() {
        const doc = this.ownerDocument;
        const link = this.part('link');
        link.querySelector('.sr').textContent = `${this.label}: ${this.value}`;
        if (this.href) link.setAttribute('href', this.href); else link.removeAttribute('href');
        const button = this.interactive && !this.href;
        link.hidden = !this.href && !button;
        if (button) { link.setAttribute('role', 'button'); link.tabIndex = 0; } else { link.removeAttribute('role'); link.removeAttribute('tabindex'); }
        const chip = this.part('delta');
        const pct = this.delta === '' ? null : Number(this.delta);
        chip.hidden = pct === null || Number.isNaN(pct);
        if (!chip.hidden) {
            const d = { pct, direction: this.deltaDirection === 'auto' ? (pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat') : this.deltaDirection };
            chip.dataset.trend = { true: 'good', false: 'bad', null: 'flat' }[String(isGood(d.direction, this.invert))];
            chip.textContent = `${d.direction === 'up' ? '▲' : d.direction === 'down' ? '▼' : '▬'} ${formatDelta(d)}`;
            const say = doc.createElement('span'); say.className = 'sr'; say.textContent = ` ${deltaSpeech(d, this.versus)}`; chip.append(say);
        }
        const spark = this.part('spark');
        spark.hidden = this.values.length < 2;
        if (!spark.hidden) {
            const svg = doc.createElementNS(SVG, 'svg'); svg.setAttribute('viewBox', '0 0 100 24'); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('aria-hidden', 'true');
            const line = doc.createElementNS(SVG, 'polyline'); line.setAttribute('points', sparkPoints(this.values));
            svg.append(line); spark.replaceChildren(svg);
        }
    }
};
