// What the scorecard measures in a real browser beyond the rendered frames (the page's own timings and the theme-switch cost come from
// js/measure.js): how long a table of N rows takes to lay out, how long a theme switch takes to restyle, and the size of
// files (raw and gzip). Every read is of a file the host names on its own origin; nothing else is requested.

import { stripComments, sameOrigin } from '../../js/framework-checks.js';
import { applyDynamic } from '../../js/dynamic.js';

// Render and lay out a pk-table of n product rows off-screen, in ms. The status cell is plain text: the test times the table, not n badge elements.
export function timeRows(doc, n) {
    const host = doc.createElement('div');
    host.dataset.dyn = 'position:absolute; left:var(--sc-frames-offscreen); top:0; width:var(--sc-measure-host-w)';
    doc.body.append(host);
    applyDynamic(doc);
    const el = (tag, text, ...kids) => { const e = doc.createElement(tag); if (text !== undefined) e.textContent = text; e.append(...kids); return e; };
    const cell = (tag, text) => el(tag, text);
    const tbody = el('tbody');
    for (let i = 0; i < n; i++) tbody.append(el('tr', undefined, el('td', undefined, el('code', `SKU-${i}`)), cell('td', `Title of product ${i}`), cell('td', 'Active'), cell('td', `$${(i % 90) + 9}.99`)));
    const grid = el('table', undefined, el('thead', undefined, el('tr', undefined, ...['SKU', 'Title', 'Status', 'Price'].map(x => cell('th', x)))), tbody);
    const pkTable = doc.createElement('pk-table'); pkTable.setAttribute('density', 'compact'); pkTable.append(grid);
    const t0 = performance.now();
    host.append(pkTable);
    host.offsetHeight; // force layout
    doc.defaultView.getComputedStyle(host.querySelector('tbody tr:last-child td')).color;
    const ms = performance.now() - t0;
    host.remove();
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
