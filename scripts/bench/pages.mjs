// Whole-page behaviour of the site the SDK ships (core/), in a real browser:
//   pages - the gallery, scorecard, theme editor and every template: load time, first contentful paint, largest contentful paint, layout shift (CLS,
//           observed from document start, page held open for 3 s after load), long-task time, JS heap after load, DOM nodes, requests and bytes.
//   sweep - the scorecard's size sweep over the templates, three rounds: does the JS heap and the DOM come back after each round (frames are removed)?
//   css   - 5,000 pk-button: are the shadow-root stylesheets shared (one adopted sheet per class, not per instance), what a full style recalculation costs
//           and what switching the theme costs with 5,000 elements on the page.
//   node scripts/bench/pages.mjs [--only=pages|sweep|css] [--runs=3] [--json file]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withBench, parseArgs, median, round, table, sleep, coreDir, shell } from './lib.mjs';

const observers = `(() => {
    const m = window.__m = { cls: 0, shifts: [], lcp: 0, fcp: 0, longMs: 0, longCount: 0 };
    new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) { m.cls += e.value; m.shifts.push({ v: +e.value.toFixed(4), t: Math.round(e.startTime), src: (e.sources?.[0]?.node?.nodeName ?? '').toLowerCase() }); } }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver(l => { for (const e of l.getEntries()) m.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') m.fcp = e.startTime; }).observe({ type: 'paint', buffered: true });
    new PerformanceObserver(l => { for (const e of l.getEntries()) { m.longCount++; m.longMs += Math.max(0, e.duration - 50); } }).observe({ type: 'longtask', buffered: true });
})()`;

const PAGES = () => {
    const tpl = fs.readdirSync(path.join(coreDir, 'samples', 'templates'), { withFileTypes: true }).filter(d => d.isDirectory()).map(d => `/samples/templates/${d.name}/${d.name}.html`).filter(f => fs.existsSync(path.join(coreDir, f)));
    return [['gallery', '/site/gallery/index.html'], ['gallery #/elements', '/site/gallery/index.html#/elements'], ['scorecard', '/site/scorecard/index.html'], ['theme editor', '/site/theme/index.html'], ...tpl.map(f => [f.split('/').at(-1).replace('.html', ' (template)'), f])];
};

async function pagesCase(server, browser, { runs }) {
    const rows = [];
    const page = await browser.newPage();
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: observers });
    for (const [name, url] of PAGES()) {
        const acc = { load: [], fcp: [], lcp: [], cls: [], long: [] }; let last;
        for (let i = -1; i < runs; i++) {
            server.log.length = 0;
            await page.send('Network.setCacheDisabled', { cacheDisabled: true });
            await page.goto('about:blank');
            const t0 = Date.now();
            await page.goto(server.origin + url);
            const load = Date.now() - t0;
            await sleep(3000);
            const m = await page.eval('window.__m');
            const h = await page.heap();
            const nodes = await page.eval('document.querySelectorAll("*").length + [...document.querySelectorAll("iframe")].reduce((n, f) => n + (f.contentDocument?.querySelectorAll("*").length ?? 0), 0)');
            if (i < 0) continue;
            acc.load.push(load); acc.fcp.push(m.fcp); acc.lcp.push(m.lcp); acc.cls.push(m.cls); acc.long.push(m.longMs);
            last = { requests: server.log.filter(r => r.status === 200).length, kb: server.log.reduce((s, r) => s + r.raw, 0) / 1024, heap: h.heap / 1048576, nodes, shifts: m.shifts };
        }
        rows.push({ page: name, 'load ms': round(median(acc.load), 0), 'FCP ms': round(median(acc.fcp), 0), 'LCP ms': round(median(acc.lcp), 0), CLS: round(median(acc.cls), 3), 'blocking ms (long tasks)': round(median(acc.long), 0), 'requests': last.requests, 'KB raw': round(last.kb, 0), 'heap MB': round(last.heap, 1), 'DOM nodes': last.nodes, 'worst shift': last.shifts.sort((a, b) => b.v - a.v)[0] ? `${last.shifts[0].v} (${last.shifts[0].src})` : '-' });
    }
    await page.close();
    return [{ caption: 'Pages (cache disabled, 1280x900, unthrottled, median of runs; CLS over load + 3 s)', rows, cols: Object.keys(rows[0]) }];
}

async function sweepCase(server, browser) {
    const page = await browser.newPage();
    await page.goto(`${server.origin}/site/scorecard/index.html`);
    await sleep(1500);
    const rows = []; const base = await page.heap();
    rows.push({ round: 'start', jobs: 0, 'ms': 0, 'heap MB after GC': round(base.heap / 1048576, 1), 'DOM nodes': base.nodes, 'JS listeners': base.listeners, documents: base.documents });
    for (let r = 1; r <= 3; r++) {
        const res = await page.eval(`(async () => { const { sweep } = await import('/site/scorecard/sweep.js'); const t = performance.now(); const out = await sweep({ kinds: ['templates'], widths: [375, 1280], themes: ['dark'], size: 2 }); return { ms: performance.now() - t, checked: out.checked, errors: out.results.filter(x => x.error).length }; })()`, { timeout: 480000 });
        const h = await page.heap();
        rows.push({ round: r, jobs: res.checked, ms: Math.round(res.ms), 'heap MB after GC': round(h.heap / 1048576, 1), 'DOM nodes': h.nodes, 'JS listeners': h.listeners, documents: h.documents, errors: res.errors });
    }
    await page.close();
    return [{ caption: 'Scorecard size sweep over the 11 templates x 2 nav modes x 2 widths (frames created and removed per job)', rows, cols: ['round', 'jobs', 'ms', 'heap MB after GC', 'DOM nodes', 'JS listeners', 'documents', 'errors'] }];
}

async function cssCase(server, browser, { runs }) {
    const page = await browser.newPage();
    server.pages.set('/__bench/css.html', shell({ script: `import { initPlainkit } from '/dist/plainkit.js'; await import('/dist/elements/button.js'); await import('/dist/elements/badge.js'); initPlainkit(); window.__ready = true;` }));
    await page.goto(`${server.origin}/__bench/css.html`);
    await page.eval('await new Promise(r => { const t = setInterval(() => window.__ready && (clearInterval(t), r()), 20); })');
    const metric = async () => Object.fromEntries((await page.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
    await page.send('Performance.enable');
    const acc = { recalc: [], themeMs: [], themeRecalc: [] }; let shared;
    for (let i = -1; i < runs; i++) {
        await page.eval('document.body.replaceChildren()');
        const r = await page.eval(`(async () => {
            const host = document.createElement('div'); document.body.append(host);
            host.innerHTML = '<pk-button>Go</pk-button><pk-badge>New</pk-badge>'.repeat(2500);
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
            const sheets = new Set(); for (const el of host.children) for (const s of el.shadowRoot.adoptedStyleSheets) sheets.add(s);
            return { sheets: sheets.size, elements: host.children.length, perElement: host.children[0].shadowRoot.adoptedStyleSheets.length, styleEls: host.querySelectorAll('style').length };
        })()`);
        shared = r;
        const before = await metric();
        const t = await page.eval(`(async () => {
            const root = document.documentElement; const t0 = performance.now();
            root.setAttribute('data-theme', root.getAttribute('data-theme') === 'light' ? 'dark' : 'light'); document.body.getBoundingClientRect(); const sync = performance.now() - t0;
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return { sync, total: performance.now() - t0 };
        })()`);
        const after = await metric();
        if (i >= 0) { acc.themeMs.push(t.total); acc.themeRecalc.push((after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000); }
    }
    await page.close();
    return [{ caption: '5,000 elements (2,500 pk-button + 2,500 pk-badge): shadow-root stylesheets and theme switch cost', rows: [{ elements: shared.elements, 'adopted sheets per element': shared.perElement, 'distinct sheets on the page': shared.sheets, '<style> elements': shared.styleEls, 'theme switch to next frame ms': round(median(acc.themeMs), 0), 'style recalc during the switch ms': round(median(acc.themeRecalc), 0) }], cols: ['elements', 'adopted sheets per element', 'distinct sheets on the page', '<style> elements', 'theme switch to next frame ms', 'style recalc during the switch ms'] }];
}

export async function run({ only = null, runs = 3 } = {}) {
    const tables = [];
    await withBench(async (server, browser) => {
        const want = k => !only || only === k;
        if (want('pages')) tables.push(...await pagesCase(server, browser, { runs }));
        if (want('sweep')) tables.push(...await sweepCase(server, browser));
        if (want('css')) tables.push(...await cssCase(server, browser, { runs }));
    });
    return { title: 'Pages', tables };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const o = parseArgs(process.argv.slice(2));
    const r = await run({ only: o.only ?? null, runs: Number(o.runs ?? 3) });
    for (const t of r.tables) console.log(`\n${t.caption}\n${table(t.rows, t.cols)}`);
    if (o.json) fs.writeFileSync(o.json, JSON.stringify(r, null, 1));
}
