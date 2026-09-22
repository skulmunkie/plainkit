// Runtime cost of the SDK in a real browser:
//   upgrade  - time to upgrade and render 1,000 and 5,000 instances of pk-button, pk-badge, pk-input and pk-card (sync = innerHTML parse + constructors +
//              first render; layout = sync + microtask renders + a forced style/layout pass), per instance, and retained heap per instance.
//   batching - renders counted for property/attribute storms in one tick (the reactive core promises one microtask-batched render).
//   leaks    - create and destroy N instances of EVERY element (from its first api.json example, so children and dependencies are there), also opened for
//              those that open; after two forced garbage collections the JS heap, the DOM nodes and the JS event listeners must return to the baseline.
//   node scripts/bench/runtime.mjs [--only=upgrade|batching|leaks] [--runs=5] [--n=2000] [--tag=pk-x (leaks: one element)] [--verbose] [--json file]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withBench, parseArgs, median, round, table, shell, coreDir } from './lib.mjs';

const api = JSON.parse(fs.readFileSync(path.join(coreDir, 'dist', 'elements', 'api.json'), 'utf8'));
const loadAll = `const reg = (await import('/dist/elements/registry.js')).default;
await Promise.all(Object.values(reg).map(p => import(new URL(p, location.origin + '/dist/elements/registry.js').href)));`;
const blank = body => shell({ body, script: `import { initPlainkit } from '/dist/plainkit.js'; window.__ready = (async () => { ${loadAll} initPlainkit(); return true; })();` });

const CASES = { 'pk-button': '<pk-button>Go</pk-button>', 'pk-badge': '<pk-badge>New</pk-badge>', 'pk-input': '<pk-input label="Name"></pk-input>', 'pk-card': '<pk-card>Body</pk-card>' };

async function upgrade(server, browser, { runs, cpu }) {
    const page = await browser.newPage();
    server.pages.set('/__bench/rt.html', blank(''));
    await page.goto(`${server.origin}/__bench/rt.html`);
    await page.eval('await window.__ready');
    await page.throttle({ cpu });
    const rows = [];
    for (const [tag, html] of Object.entries(CASES)) for (const n of [1000, 5000]) {
        const sync = [], layout = [], frame = [], perHeap = [];
        for (let i = -1; i < runs; i++) {
            await page.eval('document.body.replaceChildren()');
            const before = await page.heap();
            const r = await page.eval(`(async () => {
                const host = document.createElement('div'); document.body.append(host);
                const t0 = performance.now(); host.innerHTML = ${JSON.stringify(html)}.repeat(${n}); const t1 = performance.now();
                await Promise.resolve(); host.getBoundingClientRect(); const t2 = performance.now();
                await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); const t3 = performance.now();
                return { sync: t1 - t0, layout: t2 - t0, frame: t3 - t0, defined: host.querySelectorAll(':defined').length };
            })()`);
            const after = await page.heap();
            if (r.defined !== n) throw new Error(`${tag}: ${r.defined} of ${n} upgraded`);
            if (i >= 0) { sync.push(r.sync); layout.push(r.layout); frame.push(r.frame); perHeap.push((after.heap - before.heap) / n); }
        }
        rows.push({ cpu: `${cpu}x`, tag, instances: n, 'sync ms': round(median(sync), 0), 'layout ms': round(median(layout), 0), 'to 2nd frame ms': round(median(frame), 0), 'us/instance (layout)': round(median(layout) * 1000 / n, 1), 'heap B/instance': Math.round(median(perHeap)) });
    }
    await page.throttle({});
    await page.close();
    return rows;
}

async function batching(server, browser) {
    const page = await browser.newPage();
    server.pages.set('/__bench/rt.html', blank(''));
    await page.goto(`${server.origin}/__bench/rt.html`);
    await page.eval('await window.__ready');
    return page.eval(`(async () => {
        const count = tag => { const C = customElements.get(tag); const orig = C.prototype.render; let n = 0; C.prototype.render = function () { n++; return orig.call(this); }; return { get n() { return n; }, reset() { n = 0; }, restore() { C.prototype.render = orig; } }; };
        const out = [];
        const case_ = async (name, tag, html, storm) => {
            const c = count(tag); const host = document.createElement('div'); document.body.append(host); host.innerHTML = html; const el = host.firstElementChild;
            await Promise.resolve(); c.reset();
            storm(el); const sync = c.n; await Promise.resolve(); await Promise.resolve();
            out.push({ case: name, 'renders during the tick': sync, 'renders after microtasks': c.n });
            c.restore(); host.remove();
        };
        await case_('1,000 property sets (label), one element', 'pk-button', '<pk-button>Go</pk-button>', el => { for (let i = 0; i < 1000; i++) el.label = 'L' + i; });
        await case_('1,000 attribute sets, one element', 'pk-button', '<pk-button>Go</pk-button>', el => { for (let i = 0; i < 1000; i++) el.setAttribute('label', 'L' + i); });
        await case_('1,000 mixed prop sets (variant, size, disabled, busy)', 'pk-button', '<pk-button>Go</pk-button>', el => { for (let i = 0; i < 1000; i++) { el.disabled = i % 2 === 0; el.busy = i % 3 === 0; el.size = i % 2 ? 'sm' : 'lg'; } });
        await case_('1,000 sets to the same value (no change)', 'pk-badge', '<pk-badge>New</pk-badge>', el => { for (let i = 0; i < 1000; i++) el.variant = 'success'; });
        await case_('100 elements x 10 sets each', 'pk-badge', '<div>' + '<pk-badge>x</pk-badge>'.repeat(100) + '</div>', el => { for (const b of el.children) for (let i = 0; i < 10; i++) b.variant = i % 2 ? 'danger' : 'success'; });
        return out;
    })()`);
}

// Elements that open: the leak test also removes them while open, the worst case for a document-level subscription.
const opens = tag => api.find(e => e.tag === tag)?.props.some(p => p.name === 'open' && p.type === 'boolean');

// A control that proves the method can see a leak: this element adds a document listener when connected and never removes it. It must be reported as LEAK.
const CONTROL = { tag: 'pk-leaky-control', props: [], examples: [{ html: '<pk-leaky-control></pk-leaky-control>' }] };
const controlDefinition = `customElements.get('pk-leaky-control') || customElements.define('pk-leaky-control', class extends HTMLElement { connectedCallback() { document.addEventListener('pk-never', () => this.isConnected); } })`;

async function leaks(server, browser, { n, verbose, tag = null }) {
    const fresh = async () => {
        const page = await browser.newPage();
        server.pages.set('/__bench/rt.html', blank(''));
        await page.goto(`${server.origin}/__bench/rt.html`);
        await page.eval('await window.__ready');
        await page.eval(cycleFn); await page.eval(controlDefinition);
        return page;
    };
    const cycleFn = `window.__cycle = async (html, count, open) => {
        const host = document.createElement('div'); document.body.append(host);
        host.innerHTML = html.repeat(count);
        if (open) for (const el of host.querySelectorAll('[open-me]')) el.setAttribute('open', '');
        await new Promise(r => setTimeout(r, 0)); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        host.remove();
        await new Promise(r => setTimeout(r, 0));
    }`;
    let page = await fresh();
    const rows = [];
    for (const e of [CONTROL, ...api]) {
        if (tag && e.tag !== tag) continue;
        const html = e.examples?.[0]?.html; if (!html) continue;
        const variants = [['connected', false]]; if (opens(e.tag)) variants.push(['opened', true]);
        for (const [mode, open] of variants) {
            const src = open ? html.replace(new RegExp(`<${e.tag}(\\s|>)`), `<${e.tag} open-me$1`) : html;
            const count = open ? Math.min(n, 300) : n; // an open modal each is heavy: the opened variant uses at most 300
            try {
                if (verbose) console.error(`leaks: ${e.tag} ${mode} x${count}`);
                await page.eval(`await window.__cycle(${JSON.stringify(src)}, 30, ${open})`); // warm-up: sheets, templates, logger caches
                const before = await page.heap();
                await page.eval(`await window.__cycle(${JSON.stringify(src)}, ${count}, ${open})`);
                const after = await page.heap();
                const d = { heap: after.heap - before.heap, nodes: after.nodes - before.nodes, listeners: after.listeners - before.listeners };
                rows.push({ tag: e.tag, mode, instances: count, 'heap KB': round(d.heap / 1024, 0), 'B/instance': Math.round(d.heap / count), nodes: d.nodes, listeners: d.listeners, leak: d.listeners > 0 || d.nodes > 20 || d.heap > 512 * 1024 ? 'LEAK' : '' });
            } catch (error) { rows.push({ tag: e.tag, mode, instances: count, 'heap KB': 'error', 'B/instance': '', nodes: '', listeners: '', leak: String(error.message).slice(0, 60) }); await page.close().catch(() => {}); page = await fresh(); }
        }
    }
    await page.close();
    return rows;
}

export async function run({ only = null, runs = 5, n = 2000, verbose = false, tag = null } = {}) {
    const tables = [];
    const want = k => !only || only === k;
    await withBench(async (server, browser) => {
        if (want('upgrade')) {
            tables.push({ caption: 'Upgrade + render, unthrottled', rows: await upgrade(server, browser, { runs, cpu: 1 }), cols: ['tag', 'instances', 'sync ms', 'layout ms', 'to 2nd frame ms', 'us/instance (layout)', 'heap B/instance'] });
            tables.push({ caption: 'Upgrade + render, 4x CPU throttle', rows: await upgrade(server, browser, { runs: Math.min(runs, 3), cpu: 4 }), cols: ['tag', 'instances', 'sync ms', 'layout ms', 'to 2nd frame ms', 'us/instance (layout)', 'heap B/instance'] });
        }
        if (want('batching')) tables.push({ caption: 'requestUpdate batching (renders = render() calls)', rows: await batching(server, browser), cols: ['case', 'renders during the tick', 'renders after microtasks'] });
        if (want('leaks')) tables.push({ caption: `Create/destroy ${n} instances per element; delta after 2 forced GCs vs before (leak = any listener, more than 20 nodes or more than 512 KB retained)`, rows: await leaks(server, browser, { n, verbose, tag }), cols: ['tag', 'mode', 'instances', 'heap KB', 'B/instance', 'nodes', 'listeners', 'leak'] });
    });
    return { title: 'Runtime', tables };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const o = parseArgs(process.argv.slice(2));
    const r = await run({ only: o.only ?? null, runs: Number(o.runs ?? 5), n: Number(o.n ?? 2000), verbose: Boolean(o.verbose), tag: o.tag ?? null });
    for (const t of r.tables) console.log(`\n${t.caption}\n${table(t.rows, t.cols)}`);
    if (o.json) fs.writeFileSync(o.json, JSON.stringify(r, null, 1));
}
