// What the scorecard measures in a real browser beyond the rendered frames: the page's own timings (largest paint, layout shift, long
// tasks, slowest interaction), how long a table of N rows takes to lay out, how long a theme switch takes to restyle, and the size of
// files (raw and gzip). Every read is of a file the host names on its own origin; nothing else is requested.

import { stripComments, sameOrigin } from '../js/framework-checks.js';

// Timings collected from page load (buffered observers), so the numbers describe the page as it loaded. Returns the live object.
export function watchVitals(win) {
    const v = { lcp: null, cls: 0, longTasks: 0, inp: 0 };
    const observe = (type, fn, extra = {}) => {
        try { new win.PerformanceObserver(l => l.getEntries().forEach(fn)).observe({ type, buffered: true, ...extra }); } catch { /* not supported in this browser: the metric stays unmeasured */ }
    };
    observe('largest-contentful-paint', e => { v.lcp = e.startTime; });
    observe('layout-shift', e => { if (!e.hadRecentInput) v.cls += e.value; });
    observe('longtask', () => { v.longTasks++; });
    observe('event', e => { v.inp = Math.max(v.inp, e.duration); }, { durationThreshold: 16 });
    return v;
}

// Render and lay out a table of n product rows off-screen, in ms.
export function timeRows(doc, n) {
    const host = doc.createElement('div');
    host.style.cssText = 'position:absolute;left:-10000px;top:0;width:900px';
    doc.body.append(host);
    const rows = Array.from({ length: n }, (_, i) => `<tr><td><code>SKU-${i}</code></td><td>Title of product ${i}</td><td><span class="chip chip-success">Active</span></td><td class="num">$${(i % 90) + 9}.99</td></tr>`).join('');
    const t0 = performance.now();
    host.innerHTML = `<table class="data"><thead><tr><th>SKU</th><th>Title</th><th>Status</th><th class="num">Price</th></tr></thead><tbody>${rows}</tbody></table>`;
    host.offsetHeight; // force layout
    doc.defaultView.getComputedStyle(host.querySelector('tbody tr:last-child td')).color;
    const ms = performance.now() - t0;
    host.remove();
    return ms;
}

// Flip the theme and re-read every element's colour: the style recalculation cost of a theme switch, in ms. The theme is put back.
export function recalcMs(doc) {
    const root = doc.documentElement;
    const was = root.getAttribute('data-theme');
    const t0 = performance.now();
    root.setAttribute('data-theme', was === 'dark' ? 'light' : 'dark');
    doc.querySelectorAll('*').forEach(el => doc.defaultView.getComputedStyle(el).color);
    const ms = performance.now() - t0;
    if (was === null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', was);
    return ms;
}

// { name: url } becomes { name: text }. Only URLs of the page's own origin are read.
export async function readTexts(map, doc = document, fetchFn = globalThis.fetch) {
    const own = url => { if (!sameOrigin(url, doc.baseURI)) throw new Error(`${url}: not the page's own origin`); return url; };
    return Object.fromEntries(await Promise.all(Object.entries(map ?? {}).map(async ([name, url]) => {
        const res = await fetchFn(own(url));
        if (!res.ok) throw new Error(`${url}: ${res.status}`);
        return [name, await res.text()];
    })));
}

// Gzip size in bytes through the browser's own CompressionStream; null where the browser lacks it.
export async function gzipBytes(text) {
    if (typeof CompressionStream === 'undefined') return null;
    return (await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()).byteLength;
}

// Sizes for [{ name, url | urls, budget, strip }]: the files are joined in order (comments stripped when `strip`), then measured raw and gzip.
export async function measureSizes(entries, doc = document, fetchFn = globalThis.fetch) {
    return Promise.all((entries ?? []).map(async e => {
        const urls = [].concat(e.url ?? e.urls ?? []);
        const parts = await readTexts(Object.fromEntries(urls.map((u, i) => [i, u])), doc, fetchFn);
        let text = urls.map((_u, i) => parts[i]).join('');
        if (e.strip) text = stripComments(text);
        const gz = await gzipBytes(text);
        return { name: e.name, budget: e.budget, rawKb: text.length / 1024, gzKb: gz === null ? null : gz / 1024 };
    }));
}
