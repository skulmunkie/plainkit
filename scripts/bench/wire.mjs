// Wire benchmark: the reference pages (scripts/bench/ref-pages.mjs: one button, a form, a data table) loaded cold on a throttled profile (Slow 4G,
// 4x CPU, brotli): bytes over the wire, requests, FCP, LCP, CLS and the time until every pk-* is upgraded. One command, one JSON; timings are
// reported (median, min, max) and never gated; the bytes and requests are what core/tests/page-weight.test.mjs ratchets without a browser.
//   node scripts/bench/wire.mjs [--runs=5] [--json=bench-wire.json] [--compare=old.json] [--profile=slow-4g-4x-cpu|unthrottled]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withBench, parseArgs, summary, round, table } from './lib.mjs';
import { REF_PAGES } from './ref-pages.mjs';
import { pageGraph } from './wire-graph.mjs';

export const PROFILES = {
    'slow-4g-4x-cpu': { cpu: 4, network: { latency: 150, down: 1.6 * 1024 * 1024 / 8, up: 750 * 1024 / 8 }, compress: 'br' },
    unthrottled: { cpu: 1, network: null, compress: 'br' },
};

const observers = `(() => {
    const m = window.__m = { cls: 0, lcp: 0, fcp: 0 };
    new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) m.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver(l => { for (const e of l.getEntries()) m.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') m.fcp = e.startTime; }).observe({ type: 'paint', buffered: true });
})()`;

export async function run({ runs = 5, profile = 'slow-4g-4x-cpu' } = {}) {
    const prof = PROFILES[profile];
    if (!prof) throw new Error(`unknown profile ${profile}: ${Object.keys(PROFILES).join(', ')}`);
    const pages = {};
    await withBench(async (server, browser) => {
        const page = await browser.newPage();
        await page.send('Page.addScriptToEvaluateOnNewDocument', { source: observers });
        for (const [name, ref] of Object.entries(REF_PAGES)) {
            server.pages.set(ref.path, ref.html);
            const acc = { fcp: [], lcp: [], cls: [], upgraded: [] }; let wire;
            for (let i = -1; i < runs; i++) { // the first run is the warm-up and is not counted
                server.log.length = 0;
                await page.send('Network.setCacheDisabled', { cacheDisabled: true });
                await page.goto('about:blank');
                await page.throttle({ cpu: prof.cpu, network: prof.network });
                await page.goto(`${server.origin}${ref.path}`);
                await page.eval('await new Promise(r => { const t = setInterval(() => window.__marks && (clearInterval(t), r()), 50); })');
                await page.eval('new Promise(r => setTimeout(r, 300))'); // let LCP and CLS settle
                const m = await page.eval('({ ...window.__m, ...window.__marks })');
                await page.throttle({});
                if (i < 0) continue;
                if (m.notUpgraded) throw new Error(`${name}: ${m.notUpgraded} element(s) not upgraded`);
                acc.fcp.push(m.fcp); acc.lcp.push(m.lcp); acc.cls.push(m.cls); acc.upgraded.push(m.upgraded);
                wire = { requests: server.log.filter(r => r.status === 200).length, wireBytes: server.log.reduce((s, r) => s + r.sent, 0), rawBytes: server.log.reduce((s, r) => s + r.raw, 0) };
            }
            const g = pageGraph(ref.html, ref.path); // the deterministic numbers the ratchet uses, beside the measured ones
            pages[name] = { ...wire, static: { requests: g.requests, gzip: g.gzip, brotli: g.brotli }, fcp: summary(acc.fcp, 0), lcp: summary(acc.lcp, 0), cls: summary(acc.cls, 4), upgraded: summary(acc.upgraded, 0) };
        }
    }, { compress: prof.compress });
    return { profile, compress: prof.compress, runs, node: process.version, pages };
}

const rowsOf = r => Object.entries(r.pages).map(([page, p]) => ({ page, requests: p.requests, 'wire bytes': p.wireBytes, 'FCP ms': p.fcp.median, 'LCP ms': p.lcp.median, CLS: p.cls.median, 'upgraded ms': p.upgraded.median }));
const sign = n => (n > 0 ? '+' : '') + round(n, 4);
// Deltas against an earlier JSON: bytes and requests are exact, timings are medians and only informative.
export function compare(now, before) {
    return Object.entries(now.pages).filter(([n]) => before.pages?.[n]).map(([page, p]) => {
        const b = before.pages[page];
        return { page, 'requests': sign(p.requests - b.requests), 'wire bytes': sign(p.wireBytes - b.wireBytes), 'FCP ms': sign(p.fcp.median - b.fcp.median), 'LCP ms': sign(p.lcp.median - b.lcp.median), CLS: sign(p.cls.median - b.cls.median), 'upgraded ms': sign(p.upgraded.median - b.upgraded.median) };
    });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const o = parseArgs(process.argv.slice(2));
    const r = await run({ runs: Number(o.runs ?? 5), profile: o.profile ?? 'slow-4g-4x-cpu' });
    const cols = ['page', 'requests', 'wire bytes', 'FCP ms', 'LCP ms', 'CLS', 'upgraded ms'];
    console.log(`\nReference pages, cold, ${r.profile}, ${r.compress}, median of ${r.runs} (timings are reported, never gated)\n${table(rowsOf(r), cols)}`);
    if (o.compare) console.log(`\nDelta against ${o.compare} (timings are noise-level unless large)\n${table(compare(r, JSON.parse(fs.readFileSync(o.compare, 'utf8'))), cols)}`);
    if (o.json) fs.writeFileSync(o.json, JSON.stringify(r, null, 1));
}
