// Size sweep: every gallery view, every template and every element example at 320, 375, 640, 1024, 1280 and 1920px in both themes,
// measuring horizontal overflow, controls under 44px on a phone, nested scrollers, text under 14px and the number of h1 elements.
// Runs in the scorecard page (needs a visible tab: it uses real layout). Results can be POSTed to tools/serve.mjs --write-reports,
// which stores them in scorecard/sweep-report.json. Framework-free; ES module.

import { LAYOUTS, PATTERNS, TEMPLATES, ELEMENTS } from '../gallery/gallery.data.js';
import { sampleDoc } from '../gallery/frame.js';
import { TEXT_TIERS, TARGET_EXCEPTIONS } from './scoring.data.js';

// Results collected so far, so an interrupted run loses nothing.
export const partial = [];

export const WIDTHS = [320, 375, 640, 1024, 1280, 1920];
export const THEMES = ['dark', 'light'];
const FOUNDATIONS = ['colours', 'typography', 'spacing', 'radii-shadows', 'breakpoints', 'utilities', 'icons', 'tokens'];
const TEMPLATE_FILES = TEMPLATES.map(x => x.file.replace('samples/templates/', ''));

export function routes() {
    return [
        '#/foundations', ...FOUNDATIONS.map(f => `#/foundations/${f}`),
        '#/overview', '#/samples', '#/samples/templates', ...TEMPLATES.map(x => `#/samples/templates/${x.id}`), '#/samples/patterns', ...PATTERNS.map(p => `#/samples/patterns/${p.id}`),
        '#/samples/layouts', '#/samples/layouts/shell', '#/samples/layouts/responsive', ...LAYOUTS.map(l => `#/samples/layouts/${l.id}`), '#/elements', ...ELEMENTS.map(m => `#/elements/${m.tag}`),
    ];
}

// Level-1 headings in a document: h1 elements and role="heading" aria-level="1", inside shadow trees too (pk-page-header draws its title there).
export function countH1(root) {
    let n = 0;
    const walk = scope => { for (const el of scope.querySelectorAll('*')) { if (el.localName === 'h1' || (el.getAttribute('role') === 'heading' && el.getAttribute('aria-level') === '1')) n++; if (el.shadowRoot) walk(el.shadowRoot); } };
    walk(root);
    return n;
}

const INTERACTIVE = 'a[href], button, input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea, summary, [role="tab"]';

// Measures one document at a viewport width. `phone` turns on the touch-target check. Pure over the DOM it is given.
export function measure(doc, width, { checkH1 = true } = {}) {
    const win = doc.defaultView; const de = doc.documentElement; const out = { overflow: 0, smallTargets: 0, nestedScrollers: 0, smallText: 0, metaTooSmall: 0, readingSmall: 0, h1: null };
    out.overflow = Math.max(0, de.scrollWidth - de.clientWidth);
    if (width <= 640) {
        for (const el of doc.querySelectorAll(INTERACTIVE)) {
            if (el.closest('[hidden]') || el.disabled) continue;
            const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
            if (r.height < 43.5 && !(el.tagName === 'A' && win.getComputedStyle(el).display === 'inline') && !el.closest('.ft, .co, .csr, .cv, .page-crumbs, .tab-close') && !TARGET_EXCEPTIONS.some(x => el.matches(x.selector))) out.smallTargets++;
        }
    }
    const scrolls = el => { const s = win.getComputedStyle(el); return /(auto|scroll)/.test(s.overflowX + s.overflowY) && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1); };
    for (const el of doc.querySelectorAll('*')) {
        if (!scrolls(el) || el === doc.body || el === de) continue;
        for (let p = el.parentElement; p && p !== doc.body; p = p.parentElement) if (scrolls(p)) { out.nestedScrollers++; break; }
    }
    const walker = doc.createTreeWalker(doc.body, 4);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent.trim()) continue;
        const el = n.parentElement; if (!el || el.closest('[hidden], script, style, .u-sr-only') || el.getBoundingClientRect().width === 0) continue;
        if (el.closest(TEXT_TIERS.demoSelectors)) continue;
        const px = parseFloat(win.getComputedStyle(el).fontSize);
        if (px < TEXT_TIERS.metaPx - 0.5) out.metaTooSmall++;
        else if (px < TEXT_TIERS.readingPx - 0.5 && !el.closest(TEXT_TIERS.metaSelectors)) out.readingSmall++;
    }
    out.smallText = out.metaTooSmall + out.readingSmall;
    if (checkH1) out.h1 = countH1(doc);
    return out;
}

// ---- frames: load, settle, resize -----------------------------------------------------------------------------------------

// Every custom element tag the toolkit defines: a frame is not settled while one of these is in it and not yet defined (elements load on demand,
// and an undefined avatar or page header has no size and no title yet).
const KNOWN_TAGS = new Set(ELEMENTS.map(m => m.tag));
export const POLL_MS = 40;
export const QUIET_POLLS = 4;
export const SETTLE_TIMEOUT_MS = 20000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// What a document looks like right now: deep node count (shadow trees included), scroll size and font state as one string (`text`), and `ready`:
// loaded, every stylesheet applied, no toolkit element left undefined, the gallery's boot notice gone (it removes it when its shell is drawn).
// Two equal readings in a row while ready mean nothing will change without new input. Reading it forces layout, so a resize or a late render shows up.
export function signature(doc) {
    if (!doc.documentElement || !doc.defaultView) return { text: '', ready: false }; // mid-navigation: no document yet
    const win = doc.defaultView; let nodes = 0; let undef = 0;
    const walk = scope => { for (const el of scope.querySelectorAll('*')) { nodes++; if (KNOWN_TAGS.has(el.localName) && !win.customElements.get(el.localName)) undef++; if (el.shadowRoot) walk(el.shadowRoot); } };
    if (doc.body) walk(doc.body);
    const styled = [...doc.querySelectorAll('link[rel=stylesheet]')].every(l => l.sheet);
    const de = doc.documentElement;
    return { text: [nodes, de.scrollWidth, de.scrollHeight, doc.fonts?.status].join('|'), ready: doc.readyState === 'complete' && !!doc.body && nodes > 0 && undef === 0 && styled && !doc.getElementById('boot-notice') };
}

// Resolves when the frame's document has been ready and unchanged for QUIET_POLLS polls in a row: a condition, not a fixed sleep. Rejects at the
// timeout, so a page that never settles is reported as an error cell and not measured half-drawn.
export async function settled(f, { timeout = SETTLE_TIMEOUT_MS } = {}) {
    const started = Date.now(); let last = null; let quiet = 0;
    for (;;) {
        const d = f.contentDocument;
        const s = d ? signature(d) : { text: '', ready: false };
        quiet = s.ready && s.text === last ? quiet + 1 : 0; last = s.text;
        if (quiet >= QUIET_POLLS) return f;
        if (Date.now() - started > timeout) throw new Error(`the frame did not settle within ${timeout / 1000} s (${s.ready ? 'still changing' : 'not ready'}: ${s.text})`);
        await sleep(POLL_MS);
    }
}

function makeFrame(item, width, theme) {
    const f = document.createElement('iframe');
    f.style.cssText = `position:fixed;left:-20000px;top:0;width:${width}px;height:900px;border:0`;
    const src = item.src?.(theme); if (src) f.src = src; else f.srcdoc = item.doc(theme);
    document.body.append(f);
    return f;
}

async function pool(jobs, size, onDone) {
    let next = 0; let done = 0;
    await Promise.all(Array.from({ length: size }, async () => { while (next < jobs.length) { await jobs[next++](); onDone?.(++done, jobs.length); } }));
}

const KINDS = ['views', 'templates', 'samples'];

// The things to sweep, in a fixed order: { name, kind, src(theme) | doc(theme), checkH1 }. kinds: any of 'views', 'templates', 'samples';
// filter: a list of substrings, an item is kept when its name contains one of them.
export function items({ kinds = KINDS, filter = null } = {}) {
    const out = [];
    if (kinds.includes('views')) for (const r of routes()) out.push({ name: `gallery ${r}`, kind: 'views', checkH1: true, src: theme => new URL(`../gallery/index.html?theme=${theme}${r}`, import.meta.url).href });
    if (kinds.includes('templates')) for (const t of TEMPLATE_FILES) for (const nav of ['side', 'top']) out.push({ name: `template ${t} (${nav} nav)`, kind: 'templates', checkH1: true, src: theme => new URL(`../../samples/templates/${t}?nav=${nav}&theme=${theme}`, import.meta.url).href });
    if (kinds.includes('samples')) for (const m of ELEMENTS) m.examples.forEach((x, i) => out.push({ name: `sample ${m.tag}#${i + 1}`, kind: 'samples', checkH1: false, doc: theme => sampleDoc(x.html, { theme }) }));
    return filter?.length ? out.filter(i => filter.some(x => i.name.includes(x))) : out;
}

const failed = r => r.error || r.overflow > 0 || r.smallTargets > 0 || r.nestedScrollers > 0 || r.smallText > 0 || (r.h1 !== null && r.h1 !== 1 && !r.item.startsWith('template auth') && !r.item.startsWith('gallery #/foundations/icons'));

// One item at every width and theme. By default the document is loaded once, then resized (the width) and re-themed (the data-theme attribute, which is how
// the gallery itself switches theme), and each change is measured once the frame has settled again; { fresh: true } loads a new frame for every cell
// (slow; the cross-check for the reuse). An error in a cell is recorded and the next cell starts from a new frame.
async function sweepItem(item, { widths, themes, fresh }, out) {
    const cell = (theme, width, m) => out.push({ item: item.name, width, theme, ...m });
    let f = null;
    try {
        for (const theme of themes) for (const width of widths) {
            try {
                if (fresh || !f) { f?.remove(); f = makeFrame(item, width, theme); }
                else { f.style.width = width + 'px'; f.contentDocument.documentElement.setAttribute('data-theme', theme); }
                await settled(f);
                cell(theme, width, measure(f.contentDocument, width, { checkH1: item.checkH1 }));
            } catch (e) {
                cell(theme, width, { error: String(e.message ?? e), overflow: 0, smallTargets: 0, nestedScrollers: 0, smallText: 0, h1: null });
                f?.remove(); f = null;
            }
            if (fresh) { f?.remove(); f = null; }
        }
    } finally { f?.remove(); }
}

// Returns { checked, failures: [{ item, width, theme, ...metrics }], items }, failures in item, theme, width order. shard: { index, count } takes every
// count-th item, so several tabs (separate render processes) can each run a share; size is the number of items in flight in this tab.
export async function sweep({ kinds = KINDS, filter = null, widths = WIDTHS, themes = THEMES, progress, size = 3, shard = null, fresh = false } = {}) {
    const all = items({ kinds, filter }); const mine = shard ? all.filter((_, i) => i % shard.count === shard.index) : all;
    const results = partial; results.length = 0; const order = new Map(all.map((it, i) => [it.name, i]));
    await pool(mine.map(it => () => sweepItem(it, { widths, themes, fresh }, results)), size, (d, n) => progress?.(d, n));
    const rank = r => [order.get(r.item), themes.indexOf(r.theme), widths.indexOf(r.width)];
    const cmp = (x, y) => { const p = rank(x); const q = rank(y); return p[0] - q[0] || p[1] - q[1] || p[2] - q[2]; };
    return { checked: results.length, failures: results.filter(failed).sort(cmp), items: mine.length };
}

export function summarise(report) {
    const by = { overflow: 0, smallTargets: 0, nestedScrollers: 0, metaTooSmall: 0, readingSmall: 0, h1: 0 };
    for (const r of report.failures) { if (r.overflow > 0) by.overflow++; if (r.smallTargets > 0) by.smallTargets++; if (r.nestedScrollers > 0) by.nestedScrollers++; if (r.metaTooSmall > 0) by.metaTooSmall++; if (r.readingSmall > 0) by.readingSmall++; if (r.h1 !== null && r.h1 !== 1) by.h1++; }
    return { checked: report.checked, failing: report.failures.length, by, widths: WIDTHS, themes: THEMES };
}

export async function postReport(report, { part, final } = {}, url = '/__report') {
    const q = new URLSearchParams({ ...(part ? { part } : {}), ...(final ? { final: '1' } : {}) }).toString();
    const res = await fetch(url + (q ? '?' + q : ''), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ checked: report.checked, failures: report.failures, widths: WIDTHS, themes: THEMES }) });
    return res.status;
}
