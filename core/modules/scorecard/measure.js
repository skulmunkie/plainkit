// What the scorecard measures in a real browser beyond the rendered frames (the page's own timings and the theme-switch cost come from
// js/measure.js): how long a table of N rows takes to lay out, how long a theme switch takes to restyle, and the size of
// files (raw and gzip). Every read is of a file the host names on its own origin; nothing else is requested.

import { stripComments, sameOrigin } from '../../js/framework-checks.js';

// Render and lay out a pk-table of n product rows off-screen, in ms. The status cell is plain text: the test times the table, not n badge elements.
export function timeRows(doc, n) {
    const host = doc.createElement('div');
    host.style.cssText = 'position:absolute;left:-10000px;top:0;width:900px';
    doc.body.append(host);
    const rows = Array.from({ length: n }, (_, i) => `<tr><td><code>SKU-${i}</code></td><td>Title of product ${i}</td><td>Active</td><td class="num">$${(i % 90) + 9}.99</td></tr>`).join('');
    const t0 = performance.now();
    host.innerHTML = `<pk-table density="compact"><table><thead><tr><th>SKU</th><th>Title</th><th>Status</th><th class="num">Price</th></tr></thead><tbody>${rows}</tbody></table></pk-table>`;
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
