// Large-data behaviour of the data elements, in a real browser (dist/ elements, 1280x900, cache off). Each case prints the numbers a user would feel:
//   table   - pk-table with 100, 1,000 and 10,000 rows: first render, sort, filter, select-all, scroll frame times, DOM size (is it windowed?).
//   log     - pk-log: 10,000 appends in one tick and one per tick, capped (default max 1,000) and uncapped; scroll anchoring.
//   tree    - pk-tree with 5,050 items: build, expand all, keyboard navigation.
//   list    - pk-combobox and pk-select with 5,000 options: upgrade, open, filter.
//   misc    - pk-calendar month switches, pk-chart with 5,000 points, pk-image-gallery with 500 images (how many are fetched before scrolling).
//   node scripts/bench/scale.mjs [--only=table|log|tree|list|misc] [--runs 3] [--json file]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withBench, parseArgs, median, round, table, shell } from './lib.mjs';

const boot = names => `import { initPlainkit } from '/dist/plainkit.js'; initPlainkit();
${names.map(n => `await import('/dist/elements/${n}.js');`).join('\n')}
// Time an action until the next frame has been produced (style + layout included): what the user waits for.
window.after = async () => { await Promise.resolve(); document.body.getBoundingClientRect(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); };
window.timed = async fn => { const t = performance.now(); await fn(); document.body.getBoundingClientRect(); const sync = performance.now() - t; await window.after(); return { sync, total: performance.now() - t }; };
window.scrollFrames = async (el, steps = 60, px = 400) => { const d = []; let last = performance.now(); for (let i = 0; i < steps; i++) { el.scrollTop += px; await new Promise(r => requestAnimationFrame(r)); const n = performance.now(); d.push(n - last); last = n; } d.sort((a, b) => a - b); return { p50: d[d.length >> 1], p95: d[Math.floor(d.length * 0.95)], max: d.at(-1) }; };
window.__ready = true;`;

async function open(server, browser, names, body = '') {
    const page = await browser.newPage();
    server.pages.set('/__bench/scale.html', shell({ body, script: boot(names) }));
    await page.goto(`${server.origin}/__bench/scale.html`);
    await page.eval('await new Promise(r => { const t = setInterval(() => window.__ready && (clearInterval(t), r()), 20); })');
    return page;
}
const m = xs => round(median(xs), 0);

async function tableCase(server, browser, { runs }) {
    const rows = [];
    for (const n of [100, 1000, 10000]) {
        const acc = { render: [], sort: [], filter: [], select: [], p95: [], max: [] }; let dom;
        for (let i = -1; i < (n >= 10000 ? Math.min(runs, 3) : runs); i++) {
            const page = await open(server, browser, ['table'], '<h1>t</h1>');
            const r = await page.eval(`(async () => {
                const data = Array.from({ length: ${n} }, (_, i) => ({ id: i + 1, name: 'Item ' + ((i * 7919) % ${n}), qty: String((i * 31) % 997), status: ['Active', 'Draft', 'Archived'][i % 3], date: '2026-0' + (1 + i % 9) + '-1' + (i % 9) }));
                const el = document.createElement('pk-table'); el.selectable = true; el.maxHeight = '500px'; el.stickyHeader = true;
                el.columns = [{ key: 'id', label: 'ID', type: 'number', sortable: true }, { key: 'name', label: 'Name', sortable: true }, { key: 'qty', label: 'Qty', type: 'number', sortable: true }, { key: 'status', label: 'Status', sortable: true }, { key: 'date', label: 'Date', type: 'date', sortable: true }];
                document.body.append(el); await window.after();
                const render = await window.timed(() => { el.rows = data; });
                const trs = el.shadowRoot.querySelectorAll('tbody tr').length, nodes = el.shadowRoot.querySelectorAll('*').length;
                const sort = await window.timed(() => el.sortBy('qty', 'descending'));
                const filter = await window.timed(() => { el.filters = { name: 'Item 1' }; });
                el.filters = {}; await window.after();
                const select = await window.timed(() => el.shadowRoot.querySelector('[data-select-all]').click());
                const selected = el.selected.length;
                const scroller = el.shadowRoot.querySelector('[part="scroll"]');
                const fr = await window.scrollFrames(scroller);
                return { render: render.total, sort: sort.total, filter: filter.total, select: select.total, selected, trs, nodes, fr };
            })()`);
            await page.close();
            dom = r; if (i < 0) continue;
            acc.render.push(r.render); acc.sort.push(r.sort); acc.filter.push(r.filter); acc.select.push(r.select); acc.p95.push(r.fr.p95); acc.max.push(r.fr.max);
        }
        rows.push({ rows: n, 'first render ms': m(acc.render), 'sort ms': m(acc.sort), 'filter ms': m(acc.filter), 'select-all ms': m(acc.select), 'selected': dom.selected, 'scroll frame p95 ms': m(acc.p95), 'scroll worst ms': m(acc.max), 'rows in DOM': dom.trs, 'shadow nodes': dom.nodes });
    }
    return [{ caption: 'pk-table (5 columns, selectable, max-height 500px): ms until the next frame; median of runs', rows, cols: Object.keys(rows[0]) }];
}

async function logCase(server, browser) {
    const page = await open(server, browser, ['log'], '<pk-log id="l" style="display:block;height:300px"></pk-log>');
    const rows = [];
    for (const [name, max, mode] of [['10k appends in one tick, max 1000 (default)', 1000, 'burst'], ['10k appends, one per microtask tick, max 1000', 1000, 'ticks'], ['10k appends in one tick, max 0 (unbounded)', 0, 'burst'], ['10k appends, one per microtask tick, max 0', 0, 'ticks'], ['10k appends, one per animation frame slice (100 rows/frame), max 1000', 1000, 'frames']]) {
        const r = await page.eval(`(async () => {
            const el = document.querySelector('pk-log'); el.max = ${max}; el.clear(); el.paused = false; await window.after();
            const t0 = performance.now();
            if ('${mode}' === 'burst') { for (let i = 0; i < 10000; i++) el.append({ text: 'line ' + i + ' some log text goes here', level: i % 50 ? 'info' : 'warn', time: 1700000000000 + i }); await Promise.resolve(); }
            else if ('${mode}' === 'ticks') { for (let i = 0; i < 10000; i++) { el.append({ text: 'line ' + i + ' some log text goes here', level: 'info' }); await Promise.resolve(); } }
            else { for (let f = 0; f < 100; f++) { for (let i = 0; i < 100; i++) el.append('line ' + (f * 100 + i)); await new Promise(r => requestAnimationFrame(r)); } }
            const sync = performance.now() - t0; await window.after(); const total = performance.now() - t0;
            const s = el.shadowRoot.querySelector('[part="scroller"]'), list = el.shadowRoot.querySelector('[part="list"]');
            return { sync, total, kept: list.childElementCount, anchored: Math.abs(s.scrollHeight - s.clientHeight - s.scrollTop) <= 4, height: s.scrollHeight, paused: el.paused, top: s.scrollTop, client: s.clientHeight };
        })()`);
        rows.push({ case: name, 'append phase ms': round(r.sync, 0), 'until frame ms': round(r.total, 0), 'us/append': round(r.sync * 1000 / 10000, 1), 'rows kept': r.kept, 'stays at bottom': r.anchored, detail: r.anchored ? '' : `paused=${r.paused} top=${Math.round(r.top)} height=${r.height} client=${r.client}` });
    }
    // Scrolled up: a new append must not move the reader.
    const held = await page.eval(`(async () => {
        const el = document.querySelector('pk-log'); const s = el.shadowRoot.querySelector('[part="scroller"]');
        el.clear(); el.append(...Array.from({ length: 200 }, (_, i) => 'row ' + i)); await window.after(); s.scrollTop = 100; await new Promise(r => setTimeout(r, 50));
        const before = s.scrollTop; el.append('new'); await window.after(); return { before, after: s.scrollTop, paused: el.paused };
    })()`);
    await page.close();
    return [{ caption: 'pk-log (300 px tall)', rows, cols: Object.keys(rows[0]) }, { caption: 'pk-log scroll anchoring: reader scrolled up, one row appended', rows: [{ 'scrollTop before': held.before, 'scrollTop after': held.after, 'auto-paused': held.paused }], cols: ['scrollTop before', 'scrollTop after', 'auto-paused'] }];
}

async function treeCase(server, browser) {
    const page = await open(server, browser, ['tree', 'tree-item'], '');
    const r = await page.eval(`(async () => {
        const tree = document.createElement('pk-tree'); tree.label = 'big';
        const build = await window.timed(() => { for (let a = 0; a < 50; a++) { const A = document.createElement('pk-tree-item'); A.label = 'A' + a; for (let b = 0; b < 10; b++) { const B = document.createElement('pk-tree-item'); B.label = 'B' + b; for (let c = 0; c < 9; c++) { const C = document.createElement('pk-tree-item'); C.label = 'C' + c; B.append(C); } A.append(B); } tree.append(A); } document.body.append(tree); });
        const items = tree.querySelectorAll('pk-tree-item'); const count = items.length;
        const expand = await window.timed(() => { for (const it of items) it.expanded = true; });
        const first = items[0]; first.shadowRoot.querySelector('[part="row"]')?.focus?.(); tree.querySelector('pk-tree-item').focus();
        const keys = []; for (let i = 0; i < 40; i++) { const t = performance.now(); (document.activeElement.closest?.('pk-tree-item') ?? document.activeElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, composed: true })); keys.push(performance.now() - t); }
        keys.sort((a, b) => a - b);
        const collapse = await window.timed(() => { for (const it of items) it.expanded = false; });
        return { count, build: build.total, expand: expand.total, keyP50: keys[20], keyMax: keys.at(-1), collapse: collapse.total };
    })()`);
    await page.close();
    return [{ caption: 'pk-tree', rows: [{ items: r.count, 'build + first render ms': round(r.build, 0), 'expand all ms': round(r.expand, 0), 'collapse all ms': round(r.collapse, 0), 'ArrowDown p50 ms': round(r.keyP50, 1), 'ArrowDown worst ms': round(r.keyMax, 1) }], cols: ['items', 'build + first render ms', 'expand all ms', 'collapse all ms', 'ArrowDown p50 ms', 'ArrowDown worst ms'] }];
}

async function listCase(server, browser) {
    const opts = Array.from({ length: 5000 }, (_, i) => `<option value="v${i}">Option number ${i}</option>`).join('');
    const page = await open(server, browser, ['combobox', 'select'], '');
    const rows = [];
    for (const n of [500, 5000]) {
        const html = Array.from({ length: n }, (_, i) => `<option value="v${i}">Option number ${i}</option>`).join('');
        const r = await page.eval(`(async () => {
            const out = {};
            const host = document.createElement('div'); document.body.append(host);
            out.comboMount = (await window.timed(() => { host.innerHTML = '<pk-combobox label="c">' + ${JSON.stringify(html)} + '</pk-combobox>'; })).total;
            const c = host.firstElementChild; await window.after();
            out.comboOpen = (await window.timed(() => c.show())).total;
            const input = c.shadowRoot.querySelector('input');
            out.comboFilter = (await window.timed(() => { input.value = 'number 12'; input.dispatchEvent(new Event('input', { bubbles: true })); })).total;
            out.comboClear = (await window.timed(() => { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); })).total;
            out.comboVisible = c.shadowRoot.querySelectorAll('[part="option"]').length;
            const keys = []; for (let i = 0; i < 20; i++) { const t = performance.now(); input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, composed: true })); keys.push(performance.now() - t); } keys.sort((a, b) => a - b); out.comboArrow = keys[10];
            c.hide(); host.replaceChildren();
            out.selectMount = (await window.timed(() => { host.innerHTML = '<pk-select label="s">' + ${JSON.stringify(html)} + '</pk-select>'; })).total;
            out.selectValue = (await window.timed(() => { host.firstElementChild.value = 'v' + (${n} - 1); })).total;
            host.remove();
            return out;
        })()`);
        rows.push({ options: n, 'combobox mount ms': round(r.comboMount, 0), 'open ms': round(r.comboOpen, 0), 'filter ms': round(r.comboFilter, 0), 'clear filter ms': round(r.comboClear, 0), 'ArrowDown ms': round(r.comboArrow, 1), 'option nodes': r.comboVisible, 'select mount ms': round(r.selectMount, 0), 'select set value ms': round(r.selectValue, 0) });
    }
    await page.close();
    return [{ caption: 'pk-combobox and pk-select with many options (ms until the next frame)', rows, cols: Object.keys(rows[0]) }];
}

async function miscCase(server, browser) {
    const page = await open(server, browser, ['calendar', 'chart', 'image-gallery', 'lightbox'], '');
    const cal = await page.eval(`(async () => {
        const c = document.createElement('pk-calendar'); c.month = '2026-01-01'; document.body.append(c); await window.after();
        const t = []; for (let i = 0; i < 120; i++) { const s = performance.now(); const d = new Date(c.month.slice(0, 7) + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); c.month = d.toISOString().slice(0, 10); await window.after(); t.push(performance.now() - s); }
        t.sort((a, b) => a - b); c.remove(); return { p50: t[60], p95: t[114], cells: 0 };
    })()`);
    const chart = await page.eval(`(async () => {
        const out = {};
        for (const kind of ['line', 'bar']) { for (const n of [500, 5000]) {
            const el = document.createElement('pk-chart'); el.kind = kind; document.body.append(el); await window.after();
            const data = { labels: Array.from({ length: n }, (_, i) => 'p' + i), series: [{ name: 'a', values: Array.from({ length: n }, (_, i) => Math.sin(i / 50) * 50 + 60 + (i % 7)) }] };
            const r = await window.timed(() => { el.data = data; }); out[kind + n] = { ms: r.total, nodes: el.shadowRoot.querySelectorAll('*').length, light: el.querySelectorAll('*').length }; el.remove();
        } } return out;
    })()`);
    server.log.length = 0;
    const gal = await page.eval(`(async () => {
        const g = document.createElement('pk-image-gallery'); g.images = Array.from({ length: 500 }, (_, i) => ({ src: '/__img/' + i + '.svg', alt: 'Image ' + i }));
        const r = await window.timed(() => document.body.append(g));
        const imgs = g.shadowRoot.querySelectorAll('img'); await new Promise(r => setTimeout(r, 800));
        return { ms: r.total, imgs: imgs.length, lazy: [...imgs].filter(i => i.loading === 'lazy').length, loaded: [...imgs].filter(i => i.complete && i.naturalWidth).length };
    })()`);
    const fetched = server.log.filter(r => r.url.startsWith('/__img/')).length;
    await page.close();
    return [
        { caption: 'pk-calendar: 120 consecutive month switches (each awaits the next frame)', rows: [{ 'p50 ms': round(cal.p50, 1), 'p95 ms': round(cal.p95, 1) }], cols: ['p50 ms', 'p95 ms'] },
        { caption: 'pk-chart with many points (ms until the next frame)', rows: Object.entries(chart).map(([k, v]) => ({ chart: k.replace(/\d+/, ''), points: k.match(/\d+/)[0], ms: round(v.ms, 0), 'shadow nodes': v.nodes, 'light DOM nodes': v.light })), cols: ['chart', 'points', 'ms', 'shadow nodes', 'light DOM nodes'] },
        { caption: 'pk-image-gallery with 500 images', rows: [{ 'mount ms': round(gal.ms, 0), img: gal.imgs, 'loading=lazy': gal.lazy, 'requests before any scroll': fetched, 'images loaded': gal.loaded }], cols: ['mount ms', 'img', 'loading=lazy', 'requests before any scroll', 'images loaded'] },
    ];
}

export async function run({ only = null, runs = 3 } = {}) {
    const tables = [];
    await withBench(async (server, browser) => {
        const want = k => !only || only === k;
        if (want('table')) tables.push(...await tableCase(server, browser, { runs }));
        if (want('log')) tables.push(...await logCase(server, browser));
        if (want('tree')) tables.push(...await treeCase(server, browser));
        if (want('list')) tables.push(...await listCase(server, browser));
        if (want('misc')) tables.push(...await miscCase(server, browser));
    });
    return { title: 'Scale', tables };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const o = parseArgs(process.argv.slice(2));
    const r = await run({ only: o.only ?? null, runs: Number(o.runs ?? 3) });
    for (const t of r.tables) console.log(`\n${t.caption}\n${table(t.rows, t.cols)}`);
    if (o.json) fs.writeFileSync(o.json, JSON.stringify(r, null, 1));
}
