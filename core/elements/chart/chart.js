// Plainkit charts: tiny SVG bar, line, donut and sparkline charts that build themselves from an HTML data table.
// The table stays in the page as the accessible fallback and the source of truth. Framework-free; no imports; elements are built with DOM calls and textContent only.
//
// Used by <pk-chart>: readTable() turns a slotted table into { labels, names, series }; buildChart() builds the svg and legend with an
// element factory (the element passes one that creates SVG-namespaced nodes); the pure geometry functions can be used on their own.
// A table cell may carry data-value when its text is formatted ("$1,204"). Series colours are the --chart-1 to --chart-6 tokens.

export const SVG_NS = 'http://www.w3.org/2000/svg';
const r1 = n => Math.round(n * 10) / 10;

export const PLOT = { w: 280, h: 140, left: 30, top: 8, right: 4, bottom: 20 };

// The next "nice" axis maximum at or above max: 1, 2, 5 times a power of ten.
export function niceMax(max) {
    if (!(max > 0)) return 1;
    const p = 10 ** Math.floor(Math.log10(max));
    const f = max / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

// Axis ticks from 0 to max in `count` steps.
export const ticksFor = (max, count = 4) => Array.from({ length: count + 1 }, (_, i) => r1((max / count) * i));

// Bars for series (array of value arrays, one per series, equal length). Returns { max, rects: [{ s, i, x, y, width, height }] }.
export function barRects(series, plot = PLOT, gap = 0.3) {
    const n = series[0]?.length ?? 0;
    const max = niceMax(Math.max(0, ...series.flat()));
    const plotW = plot.w - plot.left - plot.right, plotH = plot.h - plot.top - plot.bottom;
    const band = plotW / (n || 1), inner = band * (1 - gap), width = inner / series.length;
    const rects = [];
    series.forEach((vals, s) => vals.forEach((v, i) => {
        const height = (Math.max(0, v) / max) * plotH;
        rects.push({ s, i, x: r1(plot.left + band * i + (band - inner) / 2 + width * s), y: r1(plot.h - plot.bottom - height), width: r1(width), height: r1(height) });
    }));
    return { max, rects };
}

// Points [x, y] for each series, aligned with the band centres bars use.
export function linePoints(series, plot = PLOT) {
    const n = series[0]?.length ?? 0;
    const max = niceMax(Math.max(0, ...series.flat()));
    const plotW = plot.w - plot.left - plot.right, plotH = plot.h - plot.top - plot.bottom;
    const band = plotW / (n || 1);
    return { max, lines: series.map(vals => vals.map((v, i) => [r1(plot.left + band * (i + 0.5)), r1(plot.h - plot.bottom - (Math.max(0, v) / max) * plotH)])) };
}

// Donut slices on a circle whose circumference is 100 (r = 15.9155): dash "len rest", offset so the first slice starts at 12 o'clock.
export function donutSegments(values) {
    const total = values.reduce((a, v) => a + Math.max(0, v), 0) || 1;
    const lens = values.map(v => (Math.max(0, v) / total) * 100);
    return lens.map((len, i) => ({ len: r1(len), dash: `${r1(len)} ${r1(100 - len)}`, offset: r1(25 - lens.slice(0, i).reduce((a, b) => a + b, 0)) }));
}

// "x,y x,y ..." for a sparkline scaled to its own min and max.
export function sparkPoints(values, w = 100, h = 24, pad = 2) {
    if (!values.length) return '';
    const min = Math.min(...values), span = Math.max(...values) - min || 1;
    return values.map((v, i) => `${r1(values.length === 1 ? w / 2 : pad + (i * (w - 2 * pad)) / (values.length - 1))},${r1(h - pad - ((v - min) / span) * (h - 2 * pad))}`).join(' ');
}

// A text alternative: "Title: Jan 4, Feb 6, ..." for one series, or per series with names.
export function describeChart(kind, labels, names, series) {
    const part = vals => labels.slice(0, 12).map((l, i) => `${l} ${vals[i]}`).join(', ') + (labels.length > 12 ? ', and more' : '');
    const body = series.length === 1 ? part(series[0]) : series.map((v, s) => `${names[s]}: ${part(v)}`).join('. ');
    return `${kind} chart. ${body}`;
}

// Read a data table into { labels, names, series }.
export function readTable(table) {
    const cells = row => Array.from(row.children);
    const head = table.querySelector('thead tr');
    const names = head ? cells(head).slice(1).map(c => c.textContent.trim()) : [];
    const rows = Array.from(table.querySelectorAll('tbody tr')).map(cells);
    const num = c => { const v = c.getAttribute('data-value') ?? c.textContent; const n = parseFloat(String(v).replace(/[^0-9.+-]/g, '')); return Number.isNaN(n) ? 0 : n; };
    return { labels: rows.map(c => c[0].textContent.trim()), names, series: names.map((_, s) => rows.map(c => (c[s + 1] ? num(c[s + 1]) : 0))) };
}

// Build the svg (and legend list) for a chart with `make(tag)` creating elements; returns { svg, legend }.
export function buildChart(kind, data, make, height = PLOT.h, width = PLOT.w) {
    const plot = { ...PLOT, h: height, w: width };
    const el = (tag, attrs = {}, ...kids) => { const e = make(tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v)); e.append(...kids); return e; };
    const txt = (tag, attrs, text) => { const e = el(tag, attrs); e.textContent = text; return e; };
    const { labels, names, series } = data;
    const label = describeChart({ bar: 'Bar', line: 'Line', donut: 'Donut', stack: 'Stacked bar', spark: 'Trend' }[kind] ?? 'Data', labels, names, series);
    const svg = (() => {
    if (kind === 'donut') {
        const segs = donutSegments(series[0] ?? []);
        return el('svg', { viewBox: '0 0 42 42', role: 'img', 'aria-label': label, class: 'chart-donut' },
            el('circle', { cx: 21, cy: 21, r: 15.9155, class: 'chart-donut-track' }),
            ...segs.map((s, i) => el('circle', { cx: 21, cy: 21, r: 15.9155, class: `chart-donut-seg ch-${(i % 6) + 1}`, 'stroke-dasharray': s.dash, 'stroke-dashoffset': s.offset })));
    }
    if (kind === 'stack') {
        const segs = donutSegments(series[0] ?? []);
        return el('svg', { viewBox: '0 0 100 4', preserveAspectRatio: 'none', role: 'img', 'aria-label': label, class: 'chart-stack' },
            ...segs.map((s, i) => el('rect', { class: `ch-${(i % 6) + 1}`, x: r1(segs.slice(0, i).reduce((a, b) => a + b.len, 0)), y: 0, width: s.len, height: 4 })));
    }
    if (kind === 'spark') {
        return el('svg', { viewBox: '0 0 100 24', preserveAspectRatio: 'none', role: 'img', 'aria-label': label, class: 'chart-spark' }, el('polyline', { class: 'chart-line ch-1', points: sparkPoints(series[0] ?? []) }));
    }
    {
        const geo = kind === 'line' ? linePoints(series, plot) : barRects(series, plot);
        const ticks = ticksFor(geo.max);
        const yOf = v => r1(plot.h - plot.bottom - (v / geo.max) * (plot.h - plot.top - plot.bottom));
        const band = (plot.w - plot.left - plot.right) / (labels.length || 1);
        return el('svg', { viewBox: `0 0 ${plot.w} ${plot.h}`, role: 'img', 'aria-label': label, class: 'chart-xy' },
            ...ticks.flatMap(t => [el('line', { class: 'chart-grid', x1: plot.left, x2: plot.w - plot.right, y1: yOf(t), y2: yOf(t) }), txt('text', { class: 'chart-tick', x: plot.left - 4, y: yOf(t) + 4, 'text-anchor': 'end' }, String(t))]),
            ...labels.map((l, i) => txt('text', { class: 'chart-tick', x: r1(plot.left + band * (i + 0.5)), y: plot.h - 4, 'text-anchor': 'middle' }, l)),
            ...(kind === 'line'
                ? geo.lines.flatMap((pts, s) => [el('polyline', { class: `chart-line ch-${(s % 6) + 1}`, points: pts.map(p => p.join(',')).join(' ') }), ...pts.map(p => el('circle', { class: `chart-dot ch-${(s % 6) + 1}`, cx: p[0], cy: p[1], r: 2.5 }))])
                : geo.rects.map(b => el('rect', { class: `ch-${(b.s % 6) + 1}`, x: b.x, y: b.y, width: b.width, height: b.height, rx: 1 }))));
    }
    })();
    const legendItems = kind === 'donut' || kind === 'stack' ? labels : series.length > 1 ? names : [];
    const legend = legendItems.length ? legendItems.map((t, i) => { const li = make('li'); li.setAttribute('class', `ch-${(i % 6) + 1}`); li.textContent = t; return li; }) : null;
    return { svg, legend };
}

const SVG_TAGS = ['svg', 'circle', 'line', 'text', 'rect', 'polyline'];

export default Base => class extends Base {
    connected() {
        for (const s of ['', 'caption']) this.watchSlot(s, () => this.requestUpdate());
        // Draw at the real width (one unit is one pixel) so tick labels keep their size in any container.
        if (!this.$r) { this.$r = new ResizeObserver(() => { if (Math.abs(this.part('plot').clientWidth - (this.$w ?? 0)) > 1) this.requestUpdate(); }); this.$r.observe(this.part('plot')); }
    }
    updated() {
        const doc = this.ownerDocument;
        const table = this.querySelector(':scope > table');
        const data = this.data
            ? { labels: this.data.labels ?? [], names: (this.data.series ?? []).map(s => s.name ?? ''), series: (this.data.series ?? []).map(s => s.values ?? []) }
            : table ? readTable(table) : { labels: [], names: [], series: [] };
        const make = tag => (SVG_TAGS.includes(tag) ? doc.createElementNS(SVG_NS, tag) : doc.createElement(tag));
        this.$w = this.part('plot').clientWidth;
        const { svg, legend } = buildChart(this.kind, data, make, this.height, Math.max(200, this.$w || PLOT.w));
        this.part('plot').replaceChildren(svg);
        const list = this.part('legend');
        list.hidden = !legend;
        list.replaceChildren(...(legend ?? []));
        this.part('data').hidden = !table;
        this.part('caption').hidden = !this.caption && this.slotted('caption').length === 0;
    }
};
