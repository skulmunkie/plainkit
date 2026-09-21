// Load cost: what a page pays to use 0, 1, 10 or 30 distinct pk-* elements. Requests, raw and compressed bytes, the request chain depth, and the time to
// first contentful paint and until every element is upgraded, on an unthrottled profile and on a throttled one (4x CPU, Slow 4G, gzip).
//   node scripts/bench/load.mjs [--runs 5] [--json file]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withBench, parseArgs, median, round, table, shell, coreDir } from './lib.mjs';

// Tags that upgrade with no attributes or children: the load measure is about modules, not about data.
export const TAGS = ['pk-button', 'pk-badge', 'pk-card', 'pk-input', 'pk-alert', 'pk-avatar', 'pk-divider', 'pk-progress', 'pk-spinner', 'pk-tag',
    'pk-switch', 'pk-checkbox', 'pk-select', 'pk-textarea', 'pk-stack', 'pk-cluster', 'pk-grid', 'pk-stat', 'pk-skeleton', 'pk-hint',
    'pk-icon', 'pk-rating', 'pk-range', 'pk-toolbar', 'pk-empty-state', 'pk-field', 'pk-pager', 'pk-breadcrumb', 'pk-radio-group', 'pk-tabs'];

export const PROFILES = {
    unthrottled: { cpu: 1, network: null, compress: 'none' },
    'slow-4g-4x-cpu': { cpu: 4, network: { latency: 150, down: 1.6 * 1024 * 1024 / 8, up: 750 * 1024 / 8 }, compress: 'gzip' },
};

const pageFor = tags => shell({
    body: tags.map(t => `<${t}></${t}>`).join(''),
    script: `import { initPlainkit } from '/dist/plainkit.js'; initPlainkit();
const tags = ${JSON.stringify(tags)};
const marks = {};
new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') marks.fcp = e.startTime; }).observe({ type: 'paint', buffered: true });
await Promise.all(tags.map(t => customElements.whenDefined(t)));
await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
marks.upgraded = performance.now(); marks.undefined = document.querySelectorAll(':not(:defined)').length;
window.__marks = marks;`,
});

// The longest chain of requests where each was started by the previous one (page > script > import > import ...).
function chainDepth(events) {
    const initiator = new Map(); // url -> initiator url
    for (const e of events) { const u = e.request.url; if (!initiator.has(u)) initiator.set(u, e.initiator?.url ?? e.initiator?.stack?.callFrames?.[0]?.url ?? null); }
    const depth = u => { let d = 1, cur = initiator.get(u); const seen = new Set([u]); while (cur && initiator.has(cur) && !seen.has(cur)) { seen.add(cur); d++; cur = initiator.get(cur); } return d; };
    return Math.max(0, ...[...initiator.keys()].map(depth));
}

export async function run({ runs = 5 } = {}) {
    const rows = [], data = [];
    for (const [pname, prof] of Object.entries(PROFILES)) {
        await withBench(async (server, browser) => {
            const page = await browser.newPage();
            for (const n of [0, 1, 10, 30]) {
                const tags = TAGS.slice(0, n), samples = { fcp: [], upgraded: [] };
                let last;
                server.pages.set('/__bench/load.html', pageFor(tags));
                for (let i = -1; i < runs; i++) { // i = -1 is the warm-up (browser start, JIT, disk cache of the server): not counted
                    server.log.length = 0;
                    const reqs = []; const off = page.on(m => { if (m.method === 'Network.requestWillBeSent') reqs.push(m.params); });
                    await page.send('Network.setCacheDisabled', { cacheDisabled: true });
                    await page.goto('about:blank');
                    await page.throttle({ cpu: prof.cpu, network: prof.network });
                    await page.goto(`${server.origin}/__bench/load.html`);
                    await page.eval('await new Promise(r => { const t = setInterval(() => window.__marks && (clearInterval(t), r()), 50); })');
                    const m = await page.eval('window.__marks');
                    off();
                    await page.throttle({});
                    if (i < 0) continue;
                    if (m.fcp) samples.fcp.push(m.fcp); samples.upgraded.push(m.upgraded);
                    const files = server.log.filter(r => r.url !== '/__bench/load.html' && r.status === 200);
                    last = { requests: server.log.filter(r => r.status === 200).length, raw: server.log.reduce((s, r) => s + r.raw, 0), sent: server.log.reduce((s, r) => s + r.sent, 0), depth: chainDepth(reqs), notUpgraded: m.undefined, js: files.filter(f => f.url.endsWith('.js')).length, files: files.map(f => f.url) };
                }
                const row = { profile: pname, elements: n, requests: last.requests, 'js files': last.js, 'chain depth': last.depth, raw: `${round(last.raw / 1024)} KB`, [prof.compress === 'none' ? 'sent (uncompressed)' : `sent (${prof.compress})`]: `${round(last.sent / 1024)} KB`, 'FCP ms': round(median(samples.fcp), 0), 'upgraded ms': round(median(samples.upgraded), 0), 'not upgraded': last.notUpgraded };
                rows.push(row); data.push({ ...row, files: last.files });
            }
        }, { compress: prof.compress });
    }
    return { title: 'Load cost', tables: [{ caption: 'Page with N distinct elements (cache disabled; median of runs, first run discarded as warm-up)', rows, cols: ['profile', 'elements', 'requests', 'js files', 'chain depth', 'raw', 'sent (uncompressed)', 'sent (gzip)', 'FCP ms', 'upgraded ms', 'not upgraded'] }], data, extra: staticSizes() };
}

// From the built folder, not a browser: the CSS and the loader entry, raw / gzip / brotli.
export async function staticSizes() {
    const { gz, br } = await import('./lib.mjs');
    const dist = path.join(coreDir, 'dist');
    const files = ['plainkit.min.css', 'plainkit.css', 'plainkit.js', 'js/plainkit.js', 'js/element.js', 'js/loader.js', 'js/log.js', 'elements/registry.js', 'elements/button.js', 'elements/table.js', 'elements/combobox.js'].filter(f => fs.existsSync(path.join(dist, f)) || fs.existsSync(path.join(coreDir, f)));
    const rows = files.map(f => { const p = fs.existsSync(path.join(dist, f)) ? path.join(dist, f) : path.join(coreDir, f); const b = fs.readFileSync(p); return { file: f, raw: b.length, gzip: gz(b), brotli: br(b) }; });
    return rows;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const o = parseArgs(process.argv.slice(2));
    const r = await run({ runs: Number(o.runs ?? 5) });
    for (const t of r.tables) console.log(`\n${t.caption}\n${table(t.rows, t.cols)}`);
    console.log('\nStatic sizes (bytes)\n' + table(await r.extra, ['file', 'raw', 'gzip', 'brotli']));
    if (o.json) fs.writeFileSync(o.json, JSON.stringify({ ...r, extra: await r.extra }, null, 1));
}
