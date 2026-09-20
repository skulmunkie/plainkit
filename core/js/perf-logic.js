// Pure logic behind the performance monitor (modules/performance): ratings against the Core Web Vitals thresholds, frame-rate maths,
// rolling series, resource summaries and number formatting. No DOM and no browser API, so node tests cover all of it.

// [good, poor] upper bounds: at or below the first is good, above the second is poor, between is "needs work".
export const THRESHOLDS = Object.freeze({
    lcp: [2500, 4000], fcp: [1800, 3000], ttfb: [800, 1800], inp: [200, 500], cls: [0.1, 0.25],
    fps: [30, 55], // higher is better; see rateFps
    longTask: [50, 200],
});

// 'good' | 'warn' | 'poor' for a lower-is-better metric; '' when there is no value yet.
export function rate(metric, value) {
    const t = THRESHOLDS[metric];
    if (!t || value === null || value === undefined || Number.isNaN(value)) return '';
    return value <= t[0] ? 'good' : value <= t[1] ? 'warn' : 'poor';
}

// Frames per second: 55 and up is good, 30 and up needs work, below is poor.
export function rateFps(fps) {
    if (fps === null || fps === undefined || Number.isNaN(fps)) return '';
    return fps >= THRESHOLDS.fps[1] ? 'good' : fps >= THRESHOLDS.fps[0] ? 'warn' : 'poor';
}

// Frames per second from frame timestamps (ms, ascending) inside the last `windowMs`. null when fewer than two frames are in the window.
export function fpsFrom(timestamps, now = timestamps.at(-1) ?? 0, windowMs = 1000) {
    const recent = timestamps.filter(t => t >= now - windowMs && t <= now);
    if (recent.length < 2) return null;
    const span = recent.at(-1) - recent[0];
    return span > 0 ? Math.round(((recent.length - 1) * 1000) / span) : null;
}

// Appends to a rolling series, keeping the newest `max`. Returns a new array.
export const pushSample = (series, value, max = 60) => [...series, value].slice(-max);

// Cumulative layout shift: shifts within 1 s of each other and 5 s of the window's start form a session; the value is the worst session.
// entries: [{ startTime, value, hadRecentInput }].
export function clsFrom(entries) {
    let worst = 0, session = 0, first = 0, last = 0;
    for (const e of entries) {
        if (e.hadRecentInput) continue;
        if (session && e.startTime - last < 1000 && e.startTime - first < 5000) session += e.value;
        else { session = e.value; first = e.startTime; }
        last = e.startTime;
        worst = Math.max(worst, session);
    }
    return worst;
}

// Interaction to next paint, approximated as the slowest interaction (event entries with an interactionId, one per interaction).
export function inpFrom(events) {
    const byInteraction = new Map();
    for (const e of events) if (e.interactionId) byInteraction.set(e.interactionId, Math.max(byInteraction.get(e.interactionId) ?? 0, e.duration));
    const all = [...byInteraction.values()].sort((a, b) => b - a);
    if (!all.length) return null;
    // With 50 or more interactions the 98th percentile is reported (one outlier is forgiven per 50), like the web-vitals library.
    return all[Math.min(all.length - 1, Math.floor(all.length / 50))];
}

// Long tasks (main thread blocked for 50 ms or more): the count, and the total time beyond the 50 ms budget (blocking time).
export function longTaskStats(tasks) {
    return { count: tasks.length, blocking: Math.round(tasks.reduce((n, t) => n + Math.max(0, t.duration - 50), 0)), worst: Math.round(Math.max(0, ...tasks.map(t => t.duration))) };
}

const TYPES = { script: 'script', link: 'style', css: 'style', img: 'image', image: 'image', fetch: 'fetch', xmlhttprequest: 'fetch', font: 'font' };

// Resource timing entries grouped by kind, with totals and the slowest few. entries: [{ name, duration, transferSize, initiatorType }].
export function summarizeResources(entries, top = 5) {
    const byType = {};
    let bytes = 0;
    for (const e of entries) {
        const type = TYPES[e.initiatorType] ?? 'other';
        const b = byType[type] ??= { count: 0, bytes: 0 };
        b.count++; b.bytes += e.transferSize || 0; bytes += e.transferSize || 0;
    }
    const slowest = [...entries].sort((a, b) => b.duration - a.duration).slice(0, top).map(e => ({ name: e.name, duration: Math.round(e.duration), bytes: e.transferSize || 0 }));
    return { count: entries.length, bytes, byType, slowest };
}

export function formatBytes(n) {
    if (n === null || n === undefined || Number.isNaN(n)) return '-';
    if (n < 1024) return `${Math.round(n)} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
    return `${(n / 1048576).toFixed(1)} MB`;
}

export function formatMs(n) {
    if (n === null || n === undefined || Number.isNaN(n)) return '-';
    return n < 1000 ? `${Math.round(n)} ms` : `${(n / 1000).toFixed(2)} s`;
}

// The last path segment of a URL, for a compact resource name; the whole string when it is not a URL.
export function shortName(url) {
    try { const u = new URL(url); return u.pathname.split('/').filter(Boolean).at(-1) ?? u.host; } catch { return String(url); }
}

// Points for an SVG polyline: values scaled into a width x height box, oldest at the left. max fixes the top of the scale (else the data's).
export function sparkPoints(values, width = 120, height = 32, max) {
    if (values.length < 2) return '';
    const top = max ?? Math.max(...values, 1);
    const step = width / (values.length - 1);
    return values.map((v, i) => `${(i * step).toFixed(1)},${(height - Math.min(1, Math.max(0, v / top)) * height).toFixed(1)}`).join(' ');
}
