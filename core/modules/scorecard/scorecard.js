// The scorecard as a module: mountScorecard(container, options) renders every target at every theme and width, runs the SDK's quality
// checks (accessibility, layout, spacing, touch targets, focus) on each, scores each target 0-100 and ranks them worst first.
//
//   const card = await mountScorecard(el, { targets: ['/', '/pricing.html', { name: 'Card', html: '<div class="card">...</div>' }], checks: ['accessibility'] });
//
// Options: targets (required; a URL string, { name, url } for a page of the same origin, { name, html } for markup rendered with the SDK
// stylesheets, { name, srcdoc } for a whole document, or { name, samples: [...] } for several frames scored as one), checks (keep only
// findings whose check or category is listed, e.g. ['accessibility', 'touch-target']; default all), themes (default dark and light),
// widths (default 375 and 1024), historyKey (a localStorage key: keeps the runs and shows the change since the last), autorun, theme, height.
// Returns { run(), results(), destroy() }. runTargets, openFrame and rankedTable are exported for a host page that wants to draw its own view.
// Quality checks are js/quality.js, scoring is js/scoring.js, both unchanged.

import { collect, evaluate, focusProblems } from '../../js/quality.js';
import { scoreFindings, rankWorstFirst, groupFindings, pushRun, deltas } from '../../js/scoring.js';
import { ensureStyles, styleUrls } from '../../js/mount-support.js';

const STYLES = ['../../plainkit.css'];
const OWN_STYLES = ['./scorecard.css'];

export const DEFAULTS = Object.freeze({ themes: ['dark', 'light'], widths: [375, 1024], penalty: { error: 25, warn: 8 }, concurrency: 8, settleMs: 120 });

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const slug = s => String(s).replace(/\W+/g, '-').replace(/^-|-$/g, '').toLowerCase();
export const tone = s => (s === null || s === undefined ? '' : s >= 80 ? 'sc-good' : s >= 55 ? 'sc-warn' : 'sc-bad');
export const fmtDelta = d => (d === null || d === undefined ? '' : d === 0 ? '<span class="muted">±0</span>' : `<span class="${d > 0 ? 'sc-good' : 'sc-bad'}">${d > 0 ? '+' : ''}${d}</span>`);

// Targets in any of the accepted shapes become { id, name, kind, frames: [{ url } | { html } | { srcdoc }] }; entries with nothing to render are dropped.
export function normalizeTargets(targets) {
    return (Array.isArray(targets) ? targets : []).map((t, i) => {
        const o = typeof t === 'string' ? { url: t } : (t ?? {});
        const frames = (o.samples ?? [o]).map(f => (typeof f === 'string' ? { url: f } : f)).filter(f => f && (f.url || f.html !== undefined || f.srcdoc));
        const name = o.name ?? o.url ?? `Target ${i + 1}`;
        return { id: o.id ?? (slug(name) || `target-${i + 1}`), name, kind: o.kind ?? '', frames };
    }).filter(t => t.frames.length);
}

// Findings whose check name or category is in `checks`; an empty or missing list keeps everything.
export const keepChecks = (findings, checks) => (checks?.length ? findings.filter(f => checks.includes(f.check) || checks.includes(f.category)) : findings);

const docFor = (frame, { theme, width }, base) => {
    if (frame.srcdoc) return typeof frame.srcdoc === 'function' ? frame.srcdoc({ theme, width }) : frame.srcdoc;
    const sheets = styleUrls(STYLES, base).map(h => `<link rel="stylesheet" href="${esc(h)}">`).join('');
    return `<!doctype html><html lang="en" data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${sheets}</head><body>${frame.html}</body></html>`;
};

// A frame laid out off-screen at an exact width, resolved once loaded and settled; the caller measures it and removes it.
export function openFrame(host, frame, { theme = 'dark', width = 1280, settleMs = DEFAULTS.settleMs, base = import.meta.url } = {}) {
    return new Promise(resolve => {
        const f = host.ownerDocument.createElement('iframe');
        f.style.cssText = `position:absolute;left:0;top:0;width:${width}px;height:700px;border:0`;
        f.addEventListener('load', () => {
            if (frame.url) try { f.contentDocument.documentElement.setAttribute('data-theme', theme); } catch { /* another origin: measure() reports it */ }
            setTimeout(() => resolve(f), settleMs);
        }, { once: true });
        if (frame.url) f.src = frame.url; else f.srcdoc = docFor(frame, { theme, width }, base);
        host.append(f);
    });
}

async function pool(jobs, size, onDone) {
    let next = 0; let done = 0;
    await Promise.all(Array.from({ length: size }, async () => {
        while (next < jobs.length) { const job = jobs[next++]; await job(); onDone?.(++done, jobs.length); }
    }));
}

function measure(frame, phone, focus) {
    const doc = frame.contentDocument;
    if (!doc?.body) return [{ check: 'unreadable', category: 'look', severity: 'error', selector: 'document', message: 'the page could not be read (another origin, or it failed to load)' }];
    return [...evaluate(collect(doc.body), { phone }), ...(focus ? focusProblems(doc.body) : [])];
}

// Score every target: [{ id, name, kind, findings (grouped), score }] in the order given.
export async function runTargets(targets, { host, themes = DEFAULTS.themes, widths = DEFAULTS.widths, checks, penalty = DEFAULTS.penalty, concurrency = DEFAULTS.concurrency, onProgress, base } = {}) {
    const list = normalizeTargets(targets);
    const results = new Map(list.map(t => [t.id, { target: t, findings: [] }]));
    const widest = Math.max(...widths);
    const jobs = [];
    for (const t of list) for (const frame of t.frames) for (const theme of themes) for (const width of widths) jobs.push(async () => {
        const f = await openFrame(host, frame, { theme, width, base });
        try { for (const x of measure(f, width <= 640, theme === themes[0] && width === widest)) results.get(t.id).findings.push({ ...x, context: `${theme} ${width}px` }); } finally { f.remove(); }
    });
    await pool(jobs, concurrency, onProgress);
    return list.map(t => {
        const findings = groupFindings(keepChecks(results.get(t.id).findings, checks));
        return { id: t.id, name: t.name, kind: t.kind, findings, score: scoreFindings(findings, penalty) };
    });
}

const chips = findings => (findings.length
    ? findings.slice(0, 6).map(f => `<span class="chip ${f.severity === 'error' ? 'chip-danger' : 'chip-warn'}" title="${esc(f.selector)}: ${esc(f.message)} (${esc(f.contexts.join(', '))})">${esc(f.check)}${f.count > 1 ? ` x${f.count}` : ''}</span>`).join(' ') + (findings.length > 6 ? ` <span class="muted">+${findings.length - 6} more</span>` : '')
    : '<span class="muted">none</span>');

// The ranked table, worst first. changes: [{ name, delta }] from scoring.deltas; link(item) gives the name a link target (or nothing).
export function rankedTable(items, { changes = [], link, label = 'Target' } = {}) {
    const rows = rankWorstFirst(items).map(i => {
        const href = link?.(i);
        const name = href ? `<a href="${esc(href)}">${esc(i.name)}</a>` : esc(i.name);
        return `<tr><td>${name}${i.kind ? ` <span class="muted u-text-xs">${esc(i.kind)}</span>` : ''}</td><td class="num ${tone(i.score)}">${i.score}</td><td class="num">${fmtDelta(changes.find(x => x.name === i.name)?.delta)}</td><td>${chips(i.findings)}</td></tr>`;
    });
    return `<div class="u-scroll-x"><table class="data sc-table"><thead><tr><th>${esc(label)}</th><th class="num">Score</th><th class="num">Change</th><th>Failing items</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

const storage = { getItem: k => { try { return localStorage.getItem(k); } catch { return null; } }, setItem: (k, v) => { try { localStorage.setItem(k, v); } catch { /* blocked: the run is still shown */ } } };

export async function mountScorecard(container, options = {}) {
    const { targets, theme, height, historyKey, autorun } = options;
    if (!normalizeTargets(targets).length) throw new Error('mountScorecard needs targets: URLs, { name, url }, { name, html } or { name, srcdoc }');
    await ensureStyles([...styleUrls(STYLES, import.meta.url), ...styleUrls(OWN_STYLES, import.meta.url)], container.ownerDocument);
    const root = container.ownerDocument.createElement('div');
    root.className = 'sc-module';
    if (theme) root.setAttribute('data-theme', theme);
    if (height) { root.style.height = height; root.style.overflow = 'auto'; }
    root.innerHTML = `<div class="cluster cluster--horizontal cluster--gap-sm cluster--align-center cluster--justify-start"><button type="button" class="btn-primary" data-sc-run>Run scorecard</button></div>
        <div class="sc-progress muted" role="status" aria-live="polite" data-sc-progress></div>
        <div data-sc-result><div class="empty-state"><p class="empty-state-title">No run yet</p><p class="empty-state-description">Press Run scorecard: every target is rendered at each width and theme and checked.</p></div></div>
        <div class="sc-frames" aria-hidden="true" data-sc-frames></div>`;
    container.replaceChildren(root);
    const $ = s => root.querySelector(s);
    let items = [];

    async function run() {
        const button = $('[data-sc-run]'); button.disabled = true;
        try {
            items = await runTargets(targets, { ...options, host: $('[data-sc-frames]'), onProgress: (d, n) => { $('[data-sc-progress]').textContent = `Checking ${d}/${n}…`; } });
            const overall = Math.round(items.reduce((n, i) => n + i.score, 0) / items.length);
            let changes = []; let overallDelta = null;
            if (historyKey) {
                const history = pushRun(storage, historyKey, { at: new Date().toISOString(), overall, categories: {}, items: Object.fromEntries(items.map(i => [i.name, i.score])) });
                const d = deltas(history.at(-2) ?? null, history.at(-1));
                changes = d.items; overallDelta = d.overall;
            }
            $('[data-sc-result]').innerHTML = `<div class="stat-card sc-score-big"><span class="stat-card-label">Overall</span><div class="stat-card-value-row"><span class="stat-card-value ${tone(overall)}">${overall}</span> ${fmtDelta(overallDelta)}</div></div>
                <section class="card sc-section"><div class="card-header section-header"><h2 class="section-header-title">Ranked: worst first</h2></div>${rankedTable(items, { changes })}</section>`;
            $('[data-sc-progress]').textContent = `Done. Overall ${overall}.`;
        } catch (err) { $('[data-sc-progress]').textContent = `The run failed: ${err.message}`; } finally { button.disabled = false; }
        return items;
    }

    $('[data-sc-run]').addEventListener('click', run);
    if (autorun) await run();
    return { run, results: () => items, destroy: () => root.remove() };
}
