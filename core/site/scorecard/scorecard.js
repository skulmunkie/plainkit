// The SDK scorecard: measures performance, scale, look and accessibility, scores each 0-100 against scoring.data.js, ranks
// controls worst first with their failing items, and keeps a history in localStorage (exportable) so a regression shows as a
// delta. The pure parts (audit.js, scoring.js, quality.js) also run headless under Node; this page adds the parts that need a
// browser: real layout, timings, and every sample rendered at every width and theme.

import { mountShell, readSetting, writeSetting } from '../shell.js';
import { SCORING, TEXT_PAIRS, PRIMARY_CSS } from './scoring.data.js';
import { CONTROLS } from '../gallery/gallery.data.js';
import { sampleDoc } from '../gallery/frame.js';
import { unusedSelectors } from '../../js/quality.js';
import { runTargets, openFrame, rankedTable, tone, fmtDelta } from '../../modules/scorecard/scorecard.js';
import { staticMetrics } from '../../js/audit.js';
import { applyDynamic } from '../../js/dynamic.js';
import { scoreAll, readHistory, pushRun, deltas, exportHistory, importHistory } from '../../js/scoring.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (s, r = document) => r.querySelector(s);
const text = async path => (await fetch(new URL(path, import.meta.url))).text();

// Browser timings, collected from page load (buffered observers) so the numbers describe this page as it loaded.
const perf = { lcp: null, cls: 0, longTasks: 0, inp: 0 };
function observe(type, fn, extra = {}) { try { new PerformanceObserver(l => l.getEntries().forEach(fn)).observe({ type, buffered: true, ...extra }); } catch { /* not supported in this browser: the metric stays unmeasured */ } }
observe('largest-contentful-paint', e => { perf.lcp = e.startTime; });
observe('layout-shift', e => { if (!e.hadRecentInput) perf.cls += e.value; });
observe('longtask', () => { perf.longTasks++; });
observe('event', e => { perf.inp = Math.max(perf.inp, e.duration); }, { durationThreshold: 16 });

// ---- browser measurements --------------------------------------------------------------------------------------------------
function timeRows(n) {
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:-10000px;top:0;width:900px';
    document.body.append(host);
    const rows = Array.from({ length: n }, (_, i) => `<tr><td><code>SKU-${i}</code></td><td>Title of product ${i}</td><td><span class="chip chip-success">Active</span></td><td class="num">$${(i % 90) + 9}.99</td></tr>`).join('');
    const t0 = performance.now();
    host.innerHTML = `<table class="data"><thead><tr><th>SKU</th><th>Title</th><th>Status</th><th class="num">Price</th></tr></thead><tbody>${rows}</tbody></table>`;
    host.offsetHeight; // force layout
    getComputedStyle(host.querySelector('tbody tr:last-child td')).color;
    const ms = performance.now() - t0;
    host.remove();
    return ms;
}

function recalcMs() {
    const root = document.documentElement;
    const was = root.getAttribute('data-theme');
    const t0 = performance.now();
    root.setAttribute('data-theme', was === 'dark' ? 'light' : 'dark');
    document.querySelectorAll('*').forEach(el => getComputedStyle(el).color);
    const ms = performance.now() - t0;
    root.setAttribute('data-theme', was);
    return ms;
}

const inFrame = (html, { theme, width, script = '' }) => openFrame($('#sc-frames'), { srcdoc: () => sampleDoc(html, { theme, script }) }, { theme, width });

// Every gallery control is a target: its samples are rendered at every theme and width and scored together.
const controlTargets = () => CONTROLS.map(c => ({ id: c.id, name: c.name, kind: c.kind, samples: c.samples.map(s => ({ srcdoc: ({ theme }) => sampleDoc(s.html, { theme, script: s.script }) })) }));

// Every template that claims the viewport must reach its bottom edge (minus the footer strip) at each size.
export const VIEWPORTS = [[1280, 800], [1920, 1080], [375, 812]];
async function workspaceFill() {
    const failures = [];
    for (const [w, h] of VIEWPORTS) {
        const f = document.createElement('iframe');
        f.style.cssText = `position:fixed;left:-20000px;top:0;width:${w}px;height:${h}px;border:0`;
        f.src = '../../samples/templates/workspace/workspace.html?nav=side';
        $('#sc-frames').append(f);
        await new Promise(r => f.addEventListener('load', () => setTimeout(r, 400), { once: true }));
        const d = f.contentDocument; const ws = d.querySelector('.workspace'); const foot = d.querySelector('.shell-footer');
        const bottom = ws.getBoundingClientRect().bottom; const want = h - (foot?.getBoundingClientRect().height ?? 0);
        const scroll = d.documentElement.scrollHeight > h + 1;
        if (bottom < want - 2 || scroll) failures.push({ w, h, bottom: Math.round(bottom), want: Math.round(want), pageScroll: scroll });
        f.remove();
    }
    return failures;
}

// ---- run ------------------------------------------------------------------------------------------------------------------
async function run(ui) {
    ui.progress('Reading stylesheets and scripts…');
    // The new API only: the page-level sheets and every element's css. The class-based compat layer has its own budget and is not scored.
    const registry = (await import('../../elements/registry.js')).default;
    const cssNames = [...PRIMARY_CSS, ...Object.keys(registry).map(tag => `elements/${tag.slice(3)}/${tag.slice(3)}.css`)];
    const cssFiles = Object.fromEntries(await Promise.all(cssNames.map(async n => [n, await text(`../${n}`)])));
    const jsNames = ['components/modal/modal', 'components/tabs/tabs', 'components/topbar/topbar', 'components/workspace/workspace', 'components/nav/nav', 'theme', 'colour', 'quality', 'scoring', 'audit', 'sdk', 'code-explorer/element', 'code-explorer/providers', 'code-explorer/tokenize'];
    const jsFiles = Object.fromEntries(await Promise.all(jsNames.map(async n => [n, await text(n.startsWith('components/') ? `../../${n}.js` : `../../js/${n}.js`)])));
    const stat = staticMetrics({ cssFiles, jsFiles, tokensCss: cssFiles['tokens/tokens.css'], pairs: TEXT_PAIRS });

    ui.progress('Rendering every sample at every width and theme…');
    const items = await runTargets(controlTargets(), { host: $('#sc-frames'), themes: SCORING.themes, widths: SCORING.widths, penalty: SCORING.findingPenalty, onProgress: (d, n) => ui.progress(`Rendering samples ${d}/${n}…`) });

    ui.progress('Estimating unused selectors…');
    const all = await inFrame(CONTROLS.map(c => c.samples.map(s => s.html).join('')).join(''), { theme: 'dark', width: 1280 });
    let total = 0; let unused = 0;
    for (const [n, css] of Object.entries(cssFiles)) {
        if (!/^components\//.test(n)) continue;
        const u = unusedSelectors(css, [all.contentDocument]); total += u.total; unused += u.unused.length;
    }
    all.remove();

    ui.progress('Timing the scale tests…');
    const scale = Object.fromEntries(SCORING.scaleRows.map(n => [`rows${n}Ms`, Math.round(timeRows(n))]));

    const fill = await workspaceFill();
    if (fill.length) items.push({ id: 'workspace-fill', name: 'Workspace fills the viewport', kind: 'Page templates', findings: fill.map(x => ({ check: 'workspace-fill', severity: 'error', category: 'look', selector: `${x.w}x${x.h}`, message: JSON.stringify(x), count: 1, contexts: [] })), score: 0 });
    const flat = items.flatMap(i => i.findings);
    const a11y = flat.filter(f => f.category === 'accessibility');
    const measured = {
        cssKb: stat.cssKb, jsKb: stat.jsKb, unusedRatio: total ? Math.round(unused / total * 100) / 100 : 0,
        lcpMs: perf.lcp === null ? null : Math.round(perf.lcp), cls: Math.round(perf.cls * 1000) / 1000, longTasks: perf.longTasks, inpMs: perf.inp ? Math.round(perf.inp) : null,
        domNodes: document.querySelectorAll('*').length, recalcMs: Math.round(recalcMs()),
        ...scale,
        contrastFail: stat.contrastFail, literalColours: stat.literalColours, literalSizes: stat.literalSizes,
        controlScore: Math.round(items.reduce((n, i) => n + i.score, 0) / items.length),
        spacingFindings: flat.filter(f => ['zero-gap', 'tight-controls', 'text-at-edge', 'inconsistent-gaps'].includes(f.check)).length,
        a11yErrors: a11y.filter(f => f.severity === 'error').length, a11yWarnings: a11y.filter(f => f.severity === 'warn').length,
    };
    return { measured, scores: scoreAll(SCORING, measured), items, perFile: stat.perFile };
}

// ---- view -----------------------------------------------------------------------------------------------------------------
function render(root, result, history) {
    const { scores, items, measured, perFile } = result;
    const prev = history.length > 1 ? history[history.length - 2] : null;
    const cur = history[history.length - 1];
    const d = deltas(prev, cur);
    const card = (label, score, delta, big) => `<div class="stat-card ${big ? 'sc-score-big' : ''}"><span class="stat-card-label">${esc(label)}</span><div class="stat-card-value-row"><span class="stat-card-value ${tone(score)}">${score ?? 'n/a'}</span> ${fmtDelta(delta)}</div><span class="sc-bar"><span data-dyn="width:${score ?? 0}%"></span></span></div>`;
    $('#sc-result', root).innerHTML = `
        <div class="sc-scores">${card('Overall', scores.overall, d.overall, true)}${Object.entries(scores.categories).map(([k, c]) => card(c.label, c.score, d.categories[k])).join('')}</div>
        <section class="card sc-section"><div class="card-header section-header"><h2 class="section-header-title">Ranked: worst first</h2></div>
            <p class="muted">Each control's sample is rendered in ${SCORING.themes.join(' and ')} at ${SCORING.widths.join(', ')}px. A finding costs points (${Object.entries(SCORING.findingPenalty).map(([k, v]) => `${k} ${v}`).join(', ')}); repeats across widths count once.</p>
            ${rankedTable(items, { changes: d.items, link: i => `../gallery/index.html#control-${i.id}`, label: 'Control' })}</section>
        ${Object.entries(scores.categories).map(([k, c]) => `<section class="card sc-section"><div class="card-header section-header"><h2 class="section-header-title">${esc(c.label)} <span class="${tone(c.score)}">${c.score ?? 'n/a'}</span></h2></div>
            <table class="data sc-table"><thead><tr><th>Metric</th><th class="num">Value</th><th class="num">Good</th><th class="num">Poor</th><th class="num">Score</th></tr></thead><tbody>${c.metrics.map(m => { const def = SCORING.categories[k].metrics[m.key]; return `<tr><td>${esc(m.label)}</td><td class="num">${m.value ?? 'n/a'}</td><td class="num">${def.good}</td><td class="num">${def.poor}</td><td class="num ${tone(m.score)}">${m.score ?? 'n/a'}</td></tr>`; }).join('')}</tbody></table></section>`).join('')}
        <section class="card sc-section"><div class="card-header section-header"><h2 class="section-header-title">Stylesheets</h2></div>
            <table class="data sc-table"><thead><tr><th>File</th><th class="num">Bytes</th><th class="num">Rules</th><th class="num">Selectors</th><th class="num">Literal colours</th><th class="num">Literal sizes</th></tr></thead><tbody>${perFile.map(f => `<tr><td><code>${esc(f.name)}</code></td><td class="num">${f.bytes}</td><td class="num">${f.rules}</td><td class="num">${f.selectors}</td><td class="num">${f.literalColours}</td><td class="num">${f.literalSizes}</td></tr>`).join('')}</tbody></table></section>`;
    paintHistory(root, history);
}

function paintHistory(root, history) {
    $('#sc-history', root).innerHTML = history.length ? `<table class="data sc-table"><thead><tr><th>Run</th><th class="num">Overall</th>${Object.keys(SCORING.categories).map(k => `<th class="num">${esc(SCORING.categories[k].label)}</th>`).join('')}<th class="num">Change</th></tr></thead><tbody>${[...history].reverse().map((r, i, a) => {
        const before = a[i + 1]; const dl = before ? r.overall - before.overall : null;
        return `<tr><td>${esc(new Date(r.at).toLocaleString())}</td><td class="num ${tone(r.overall)}">${r.overall ?? 'n/a'}</td>${Object.keys(SCORING.categories).map(k => `<td class="num">${r.categories?.[k] ?? 'n/a'}</td>`).join('')}<td class="num">${fmtDelta(dl)}</td></tr>`;
    }).join('')}</tbody></table>` : '<p class="muted">No runs yet.</p>';
}

// Security and defect findings from tools/security.mjs (generated into security-report.json), worst first, linked into the Files page.
async function securitySection(root) {
    const host = root.querySelector('#sc-security');
    try {
        const res = await fetch(new URL('./security-report.json', import.meta.url));
        if (!res.ok) throw new Error(String(res.status));
        const report = await res.json();
        const chip = { critical: 'chip-danger', high: 'chip-danger', medium: 'chip-warn', low: 'chip' };
        const link = f => `../files/index.html#path=${encodeURIComponent(f.file)}&line=${f.line}`;
        host.innerHTML = `<div class="cluster cluster--horizontal cluster--gap-sm cluster--align-center cluster--justify-start">${Object.entries(report.counts).map(([k, v]) => `<span class="chip ${chip[k]}">${esc(k)} ${v}</span>`).join('')}</div>
            <table class="data sc-table u-mt-3"><thead><tr><th>Severity</th><th>Rule</th><th>Where</th><th>Detail</th></tr></thead><tbody>${report.findings.slice(0, 60).map(f => `<tr><td><span class="chip ${chip[f.severity]}">${esc(f.severity)}</span></td><td><code>${esc(f.rule)}</code></td><td><a href="${link(f)}">${esc(f.file)}:${f.line}</a></td><td>${esc(f.message)}</td></tr>`).join('')}</tbody></table>${report.findings.length > 60 ? `<p class="muted">Showing 60 of ${report.findings.length}.</p>` : ''}`;
    } catch (err) { host.innerHTML = `<p class="muted">No security report yet (${esc(err.message)}). Run node tools/security.mjs --write.</p>`; }
}

// The last full size sweep (scorecard/sweep-report.json): what was measured and what failed.
async function sweepSection(root) {
    const host = root.querySelector('#sc-sweep');
    try {
        const res = await fetch(new URL('./sweep-report.json', import.meta.url));
        if (!res.ok) throw new Error(String(res.status));
        const r = await res.json();
        const rows = r.failures.slice(0, 40).map(f => `<tr><td>${esc(f.item)}</td><td class="num">${f.width}</td><td>${esc(f.theme)}</td><td class="num">${f.overflow ?? 0}</td><td class="num">${f.smallTargets ?? 0}</td><td class="num">${f.readingSmall ?? 0}</td><td class="num">${f.metaTooSmall ?? 0}</td><td class="num">${f.nestedScrollers ?? 0}</td></tr>`).join('');
        host.innerHTML = `<div class="cluster cluster--horizontal cluster--gap-sm cluster--align-center cluster--justify-start"><span class="chip ${r.failures.length ? 'chip-warn' : 'chip-success'}">${r.failures.length} failing</span><span class="chip">${r.checked} cells checked</span><span class="chip">${r.widths.join(', ')}px</span><span class="chip">${r.themes.join(' + ')}</span>${r.partial ? '<span class="chip chip-danger">partial</span>' : ''}</div><p class="muted u-mt-3">Every gallery view, template (side and top nav) and control sample: overflow, targets under 44px on a phone, reading text under 14px, secondary text under 12px, nested scrollers, h1 count.</p>${rows ? `<table class="data sc-table"><thead><tr><th>Item</th><th class="num">Width</th><th>Theme</th><th class="num">Overflow</th><th class="num">Targets</th><th class="num">Reading</th><th class="num">Meta</th><th class="num">Nested</th></tr></thead><tbody>${rows}</tbody></table>` : ''}${(r.remeasured ?? []).map(x => `<p class="muted">${esc(x.item)}: ${esc(x.note)}</p>`).join('')}`;
    } catch (err) { host.innerHTML = `<p class="muted">No sweep report yet (${esc(err.message)}).</p>`; }
}

const storage = { getItem: k => { try { return localStorage.getItem(k); } catch { return null; } }, setItem: (k, v) => { try { localStorage.setItem(k, v); } catch { /* blocked */ } } };

async function main() {
    mountShell({ page: 'scorecard', title: 'Scorecard' });
    const root = $('#sc-root');
    new MutationObserver(() => applyDynamic(root)).observe(root, { childList: true, subtree: true });
    root.innerHTML = `
        <p class="muted">Scores 0-100 for performance, scale, look and accessibility, from the definitions in <code>scorecard/scoring.data.js</code> (every threshold is a setting there). A run renders every gallery sample at ${SCORING.widths.join(', ')}px in both themes, so it takes a little while.</p>
        <div class="cluster cluster--horizontal cluster--gap-sm cluster--align-center cluster--justify-start">
            <button type="button" class="btn-primary" id="sc-run">Run scorecard</button>
            <button type="button" class="btn-ghost" id="sc-export">Export history</button>
            <label class="btn-ghost sc-import-label" for="sc-import">Import history</label><input type="file" id="sc-import" accept="application/json" hidden>
            <button type="button" class="btn-warn" id="sc-clear">Clear history</button>
        </div>
        <div class="sc-progress muted" id="sc-progress" role="status" aria-live="polite"></div>
        <div id="sc-result"><div class="empty-state"><p class="empty-state-title">No run yet</p><p class="empty-state-description">Press Run scorecard. Results are stored in this browser so the next run shows what changed.</p></div></div>
        <section class="card sc-section"><div class="card-header section-header"><h2 class="section-header-title">Size sweep</h2></div><div id="sc-sweep"><p class="muted loading">Loading…</p></div></section>
        <section class="card sc-section"><div class="card-header section-header"><h2 class="section-header-title">Security and defects</h2></div><div id="sc-security"><p class="muted loading">Loading…</p></div></section>
        <section class="card sc-section"><div class="card-header section-header"><h2 class="section-header-title">History</h2></div><div id="sc-history"></div></section>
        <div class="sc-frames" id="sc-frames" aria-hidden="true"></div>`;
    paintHistory(root, readHistory(storage, SCORING.historyKey));
    securitySection(root);
    sweepSection(root);

    $('#sc-run').addEventListener('click', async e => {
        const b = e.currentTarget; b.disabled = true;
        try {
            const result = await run({ progress: t => { $('#sc-progress').textContent = t; } });
            const history = pushRun(storage, SCORING.historyKey, {
                at: new Date().toISOString(), overall: result.scores.overall,
                categories: Object.fromEntries(Object.entries(result.scores.categories).map(([k, c]) => [k, c.score])),
                items: Object.fromEntries(result.items.map(i => [i.name, i.score])),
            }, SCORING.historyMax);
            render(root, result, history);
            $('#sc-progress').textContent = `Done. Overall ${result.scores.overall}.`;
        } catch (err) { $('#sc-progress').innerHTML = `<span class="form-error" role="alert">The run failed: ${esc(err.message)}</span>`; } finally { b.disabled = false; }
    });
    $('#sc-export').addEventListener('click', () => {
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([exportHistory(readHistory(storage, SCORING.historyKey))], { type: 'application/json' })); a.download = 'pk-scorecard-history.json'; a.click(); URL.revokeObjectURL(a.href);
    });
    $('#sc-import').addEventListener('change', async e => {
        try { const h = importHistory(await e.target.files[0].text()); storage.setItem(SCORING.historyKey, JSON.stringify(h.slice(-SCORING.historyMax))); paintHistory(root, h); $('#sc-progress').textContent = `Imported ${h.length} runs.`; } catch (err) { $('#sc-progress').innerHTML = `<span class="form-error" role="alert">${esc(err.message)}</span>`; }
    });
    $('#sc-clear').addEventListener('click', () => { storage.setItem(SCORING.historyKey, '[]'); paintHistory(root, []); });
}

main().catch(err => {
    const n = document.createElement('div');
    n.className = 'notice notice--error gx-notice-file';
    n.setAttribute('role', 'alert');
    n.textContent = `The scorecard could not start: ${err.message}. Serve the Plainkit folder with a static server.`;
    document.body.append(n);
});
