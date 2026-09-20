// The scorecard as a module: mountScorecard(container, options) renders every target at every theme and width, runs the SDK's quality
// checks (accessibility, layout, spacing, touch targets, focus) on each, scores each target 0-100 and ranks them worst first. Optional
// sections add the framework-level checks, so one module serves a page, a set of pages or the whole framework.
//
//   const card = await mountScorecard(el, { targets: ['/', '/pricing.html', { name: 'Card', html: '<div class="card">...</div>' }], checks: ['accessibility'] });
//   await mountScorecard(el, { sections: ['security', 'api', 'size'], data: { security: '/security-report.json', apiBaseline: '/api.baseline.json', api: '/api.current.json', budgets, sizes } });
//
// Options: targets (required for the ranked and performance sections; a URL string, { name, url } for a page of the same origin,
// { name, html } for markup rendered with the SDK stylesheets, { name, srcdoc } for a whole document, or { name, samples: [...] } for
// several frames scored as one), checks (keep only findings whose check or category is listed, e.g. ['accessibility', 'touch-target'];
// default all), themes (default dark and light), widths (default 375 and 1024), historyKey (a localStorage key: keeps the runs and shows
// the change since the last), historyMax (runs kept, default 40), autorun, theme, height, link (item => href for a ranked name).
// sections: which parts to show, from ranked, performance, size, api, sweep, security, history; default ['ranked'], which is the
// scorecard as it always was.
//   ranked       the score and every target worst first (needs a run)
//   performance  scored categories (performance, scale, look, accessibility) with their metrics and stylesheets (a run; needs data.scoring)
//   size         gzip size of built files against their budgets (data.sizes, data.budgets)
//   api          the API surface against the previous release: what was removed or added (data.apiBaseline, data.api)
//   sweep        the last full size sweep (data.sweep)
//   security     security and defect findings (data.security; fileLink(file, line) makes the place a link)
//   history      the kept runs, with export, import and clear (needs historyKey)
// data: each entry is a URL of the host's own origin (a relative URL is read against the page) or the parsed object. A section whose data
// is missing says so with an empty state. security, apiBaseline, api, sweep, budgets, scoring (the scoring definitions), sizes (a list of
// { name, url | urls, budget, strip }), files ({ css: { name: url }, js: { name: url }, tokens: name, pairs, frame, unusedIn }).
// extraItems({ host }) may return more ranked items (a check the host runs itself).
// Returns { run(), results(), report(), ready, destroy() }. runTargets, openFrame and rankedTable are exported for a host page that wants
// to draw its own view. Quality checks are js/quality.js, scoring is js/scoring.js, both unchanged; the pure section logic is
// js/framework-checks.js. Nothing is requested but the module's own files and the data files named above.

import { collect, evaluate, focusProblems, unusedSelectors } from '../../js/quality.js';
import { scoreFindings, rankWorstFirst, groupFindings, scoreAll, readHistory, pushRun, deltas, exportHistory, importHistory } from '../../js/scoring.js';
import { staticMetrics } from '../../js/audit.js';
import { ensureStyles, styleUrls, loadJson } from '../../js/mount-support.js';
import { loadElements } from '../../js/loader.js';
import { sameOrigin } from '../../js/framework-checks.js';
import { watchVitals, timeRows, recalcMs, readTexts, measureSizes } from './measure.js';
import { h, card, missing, scoreTiles, categoryTabs, paintSize, paintApi, paintSweep, paintSecurity, paintHistory, note } from './sections.js';

const STYLES = ['../../plainkit.css'];
const OWN_STYLES = ['./scorecard.css'];

export const DEFAULTS = Object.freeze({ themes: ['dark', 'light'], widths: [375, 1024], penalty: { error: 25, warn: 8 }, concurrency: 8, settleMs: 120 });
export const SECTIONS = Object.freeze(['ranked', 'performance', 'size', 'api', 'sweep', 'security', 'history']);

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

// Markup the module writes itself (fixed strings and the ranked table, every dynamic value escaped) becomes nodes here, the one sink.
const fromHtml = (doc, markup) => { const t = doc.createElement('template'); t.innerHTML = markup; return t.content; };

const NOT_YET = ['No run yet', 'Press Run scorecard: every target is rendered at each width and theme and checked.'];
const meanScore = items => Math.round(items.reduce((n, i) => n + i.score, 0) / items.length);

export async function mountScorecard(container, options = {}) {
    const { targets, theme, height, historyKey, historyMax, autorun, link, fileLink, extraItems } = options;
    const data = options.data ?? {};
    const sections = new Set(options.sections ?? ['ranked']);
    for (const s of sections) if (!SECTIONS.includes(s)) throw new Error(`mountScorecard: unknown section "${s}" (one of ${SECTIONS.join(', ')})`);
    const runs = sections.has('ranked') || sections.has('performance');
    if (runs && !normalizeTargets(targets).length) throw new Error('mountScorecard needs targets: URLs, { name, url }, { name, html } or { name, srcdoc }');
    const doc = container.ownerDocument;
    await ensureStyles([...styleUrls(STYLES, import.meta.url), ...styleUrls(OWN_STYLES, import.meta.url)], doc);
    const multi = sections.size > 1 || !sections.has('ranked');
    const root = doc.createElement('div');
    root.className = 'sc-module';
    if (theme) root.setAttribute('data-theme', theme);
    if (height) { root.style.height = height; root.style.overflow = 'auto'; }
    root.replaceChildren(fromHtml(doc, `${runs ? `<div class="cluster cluster--horizontal cluster--gap-sm cluster--align-center cluster--justify-start"><button type="button" class="btn-primary" data-sc-run>Run scorecard</button></div>
        <div class="sc-progress muted" role="status" aria-live="polite" data-sc-progress></div>
        <div data-sc-result><div class="empty-state"><p class="empty-state-title">${NOT_YET[0]}</p><p class="empty-state-description">${NOT_YET[1]}</p></div></div>` : ''}
        <div class="sc-frames" aria-hidden="true" data-sc-frames></div>`));
    container.replaceChildren(root);
    const $ = s => root.querySelector(s);
    let items = [];
    let last = null;

    // Own-origin data: a URL string is read from the host's origin only; anything else is the value itself.
    const load = async value => {
        if (typeof value === 'string' && !sameOrigin(value, doc.baseURI)) throw new Error(`${value}: data files must be on the page's own origin`);
        return loadJson(value);
    };

    // ---- the sections that need no run: each is a card that fills when its data has loaded --------------------------------
    const hosts = {};
    const heading = { size: 'Size and budgets', api: 'API surface', sweep: 'Size sweep', security: 'Security and defects', history: 'History' };
    for (const name of ['size', 'api', 'sweep', 'security', 'history']) {
        if (!sections.has(name)) continue;
        const body = h(doc, 'div', {}, note(doc, 'Loading…'));
        hosts[name] = body;
        root.insertBefore(card(doc, heading[name], body), $('[data-sc-frames]'));
    }
    const fill = (name, get, paint, hint) => (hosts[name] ? Promise.resolve().then(get).then(v => paint(v)).catch(err => missing(doc, hosts[name], hint, `${err.message}`)) : null);
    const paintHist = () => {
        const history = historyKey ? readHistory(storage, historyKey) : [];
        if (!historyKey) return missing(doc, hosts.history, 'history key', 'Pass historyKey: the runs are kept in this browser under it.');
        return load(data.scoring).then(scoring => scoring, () => undefined).then(scoring => paintHistory(doc, hosts.history, {
            history, scoring,
            actions: {
                onExport: () => { const a = doc.createElement('a'); a.href = URL.createObjectURL(new Blob([exportHistory(readHistory(storage, historyKey))], { type: 'application/json' })); a.download = `${historyKey}.json`; a.click(); URL.revokeObjectURL(a.href); },
                onImport: async file => { try { const imported = importHistory(await file.text()); storage.setItem(historyKey, JSON.stringify(imported.slice(-(historyMax ?? 40)))); setProgress(`Imported ${imported.length} runs.`); } catch (err) { setProgress(`The import failed: ${err.message}`); } paintHist(); },
                onClear: () => { storage.setItem(historyKey, '[]'); paintHist(); },
            },
        }));
    };
    const setProgress = text => { const p = $('[data-sc-progress]'); if (p) p.textContent = text; };

    const ready = Promise.all([
        fill('size', async () => ({ sizes: await measureSizes(data.sizes, doc), budgets: await load(data.budgets) }), v => paintSize(doc, hosts.size, v), 'sizes'),
        fill('api', async () => ({ baseline: await load(data.apiBaseline), current: await load(data.api) }), v => paintApi(doc, hosts.api, v), 'API surface'),
        fill('sweep', () => load(data.sweep), v => paintSweep(doc, hosts.sweep, v), 'sweep report'),
        fill('security', () => load(data.security), v => paintSecurity(doc, hosts.security, v, { fileLink }), 'security report'),
        hosts.history ? paintHist() : null,
    ].filter(Boolean)).then(() => loadElements(root).catch(() => {}));

    // ---- a run: frames, then (performance) the measurements that need a real browser ---------------------------------------
    async function measured(scoring, ranked) {
        const files = data.files ?? {};
        const host = $('[data-sc-frames]');
        setProgress('Reading stylesheets and scripts…');
        const cssFiles = await readTexts(files.css, doc);
        const jsFiles = await readTexts(files.js, doc);
        const stat = staticMetrics({ cssFiles, jsFiles, tokensCss: cssFiles[files.tokens] ?? '', pairs: files.pairs ?? [] });
        let total = 0; let unused = 0;
        if (files.frame) {
            setProgress('Estimating unused selectors…');
            const all = await openFrame(host, files.frame, { theme: 'dark', width: 1280, base: options.base });
            for (const [n, css] of Object.entries(cssFiles)) {
                if (!(files.unusedIn ?? ['components/']).some(p => n.startsWith(p))) continue;
                const u = unusedSelectors(css, [all.contentDocument]); total += u.total; unused += u.unused.length;
            }
            all.remove();
        }
        setProgress('Timing the scale tests…');
        const scale = Object.fromEntries((scoring.scaleRows ?? []).map(n => [`rows${n}Ms`, Math.round(timeRows(doc, n))]));
        const extra = extraItems ? await extraItems({ host }) : [];
        ranked.push(...(extra ?? []));
        const flat = ranked.flatMap(i => i.findings);
        const a11y = flat.filter(f => f.category === 'accessibility');
        const vitals = vitalsOf();
        const m = {
            cssKb: stat.cssKb, jsKb: stat.jsKb, unusedRatio: total ? Math.round(unused / total * 100) / 100 : 0,
            lcpMs: vitals.lcp === null ? null : Math.round(vitals.lcp), cls: Math.round(vitals.cls * 1000) / 1000, longTasks: vitals.longTasks, inpMs: vitals.inp ? Math.round(vitals.inp) : null,
            domNodes: doc.querySelectorAll('*').length, recalcMs: Math.round(recalcMs(doc)),
            ...scale,
            contrastFail: stat.contrastFail, literalColours: stat.literalColours, literalSizes: stat.literalSizes,
            controlScore: meanScore(ranked),
            spacingFindings: flat.filter(f => ['zero-gap', 'tight-controls', 'text-at-edge', 'inconsistent-gaps'].includes(f.check)).length,
            a11yErrors: a11y.filter(f => f.severity === 'error').length, a11yWarnings: a11y.filter(f => f.severity === 'warn').length,
        };
        return { measured: m, scores: scoreAll(scoring, m), perFile: stat.perFile };
    }
    let vitals = null;
    const vitalsOf = () => (vitals ??= watchVitals(doc.defaultView));
    if (sections.has('performance')) vitalsOf();

    async function run() {
        const button = $('[data-sc-run]');
        if (!button) return items;
        button.disabled = true;
        try {
            const perf = sections.has('performance');
            const scoring = perf ? await load(data.scoring) : null;
            if (perf && !scoring) throw new Error('the performance section needs data.scoring');
            setProgress('Rendering every target at every width and theme…');
            items = await runTargets(targets, {
                host: $('[data-sc-frames]'), themes: options.themes ?? scoring?.themes, widths: options.widths ?? scoring?.widths, penalty: options.penalty ?? scoring?.findingPenalty,
                checks: options.checks, concurrency: options.concurrency, base: options.base, onProgress: (d, n) => setProgress(`Checking ${d}/${n}…`),
            });
            const report = perf ? await measured(scoring, items) : null;
            const overall = report ? report.scores.overall : meanScore(items);
            let changes = []; let d = { overall: null, categories: {}, items: [] }; let history = [];
            if (historyKey) {
                history = pushRun(storage, historyKey, {
                    at: new Date().toISOString(), overall,
                    categories: report ? Object.fromEntries(Object.entries(report.scores.categories).map(([k, c]) => [k, c.score])) : {},
                    items: Object.fromEntries(items.map(i => [i.name, i.score])),
                }, historyMax);
                d = deltas(history.at(-2) ?? null, history.at(-1));
                changes = d.items;
                if (hosts.history) paintHist();
            }
            last = { items, overall, ...(report ?? {}) };
            const result = $('[data-sc-result]');
            if (!perf) {
                const big = `<div class="stat-card sc-score-big"><span class="stat-card-label">Overall</span><div class="stat-card-value-row"><span class="stat-card-value ${tone(overall)}">${overall}</span> ${fmtDelta(d.overall)}</div></div>`;
                if (multi) result.replaceChildren(fromHtml(doc, big), card(doc, 'Ranked: worst first', fromHtml(doc, rankedTable(items, { changes, link }))));
                else result.replaceChildren(fromHtml(doc, `${big}
                    <section class="card sc-section"><div class="card-header section-header"><h2 class="section-header-title">Ranked: worst first</h2></div>${rankedTable(items, { changes, link })}</section>`));
            } else {
                const parts = [scoreTiles(doc, report.scores, { deltas: d, history })];
                if (sections.has('ranked')) {
                    const table = fromHtml(doc, rankedTable(items, { changes, link, label: options.rankedLabel ?? 'Target' }));
                    parts.push(card(doc, 'Ranked: worst first', note(doc, `Each target is rendered in ${scoring.themes.join(' and ')} at ${scoring.widths.join(', ')}px. A finding costs points (${Object.entries(scoring.findingPenalty).map(([k, v]) => `${k} ${v}`).join(', ')}); repeats across widths count once.`), table));
                }
                parts.push(card(doc, 'Scores in detail', categoryTabs(doc, scoring, report.scores, report.perFile)));
                result.replaceChildren(...parts);
                loadElements(result).catch(() => {});
            }
            setProgress(`Done. Overall ${overall}.`);
        } catch (err) { setProgress(`The run failed: ${err.message}`); } finally { button.disabled = false; }
        return items;
    }

    $('[data-sc-run]')?.addEventListener('click', run);
    if (multi) loadElements(root).catch(() => {});
    if (autorun && runs) await run();
    return { run, results: () => items, report: () => last, ready, destroy: () => root.remove() };
}
