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
    if (checkH1) out.h1 = doc.querySelectorAll('h1').length;
    return out;
}

function frame(src, width, doc) {
    return new Promise(resolve => {
        const f = document.createElement('iframe');
        f.style.cssText = `position:fixed;left:-20000px;top:0;width:${width}px;height:900px;border:0`;
        if (doc) f.srcdoc = doc; else f.src = src;
        document.body.append(f);
        // Settled when the document has content and its node count has stopped changing, or after 6s.
        const started = Date.now(); let last = -1; let stable = 0;
        const timer = setInterval(() => {
            const d = f.contentDocument; const n = d?.body ? d.body.querySelectorAll('*').length : 0;
            stable = n > 3 && n === last ? stable + 1 : 0; last = n;
            // Styles must be applied before anything is measured: every stylesheet link loaded (a half-styled frame reads as small targets and text).
            const styled = !!d && [...d.querySelectorAll('link[rel=stylesheet]')].every(l => l.sheet);
            const ready = styled && (src ? !!d?.querySelector('h1') : true);
            if ((ready && stable >= (src ? 5 : 3)) || Date.now() - started > 8000) { clearInterval(timer); resolve(f); }
        }, 120);
    });
}

async function pool(jobs, size, onDone) {
    let next = 0; let done = 0;
    await Promise.all(Array.from({ length: size }, async () => { while (next < jobs.length) { await jobs[next++](); onDone?.(++done, jobs.length); } }));
}

// kinds: any of 'views', 'templates', 'samples'. Returns { checked, failures: [{ item, width, theme, ...metrics }], results }.
export async function sweep({ kinds = ['views', 'templates', 'samples'], widths = WIDTHS, themes = THEMES, progress, size = 6 } = {}) {
    const results = partial; results.length = 0; const jobs = [];
    const add = (item, run) => { for (const theme of themes) for (const width of widths) jobs.push(async () => { try { const m = await run(width, theme); results.push({ item, width, theme, ...m }); } catch (e) { results.push({ item, width, theme, error: String(e), overflow: 0, smallTargets: 0, nestedScrollers: 0, smallText: 0, h1: null }); } }); };
    if (kinds.includes('views')) for (const r of routes()) add(`gallery ${r}`, async (w, theme) => { const f = await frame(new URL(`../gallery/index.html?theme=${theme}${r}`, import.meta.url).href, w); try { return measure(f.contentDocument, w); } finally { f.remove(); } });
    if (kinds.includes('templates')) for (const t of TEMPLATE_FILES) for (const nav of ['side', 'top']) add(`template ${t} (${nav} nav)`, async (w, theme) => { const f = await frame(new URL(`../../samples/templates/${t}?nav=${nav}&theme=${theme}`, import.meta.url).href, w); try { return measure(f.contentDocument, w); } finally { f.remove(); } });
    if (kinds.includes('samples')) for (const m of ELEMENTS) m.examples.forEach((x, i) => add(`sample ${m.tag}#${i + 1}`, async (w, theme) => { const f = await frame(null, w, sampleDoc(x.html, { theme })); try { return measure(f.contentDocument, w, { checkH1: false }); } finally { f.remove(); } }));
    await pool(jobs, size, progress);
    const bad = r => r.error || r.overflow > 0 || r.smallTargets > 0 || r.nestedScrollers > 0 || r.smallText > 0 || (r.h1 !== null && r.h1 !== 1 && !r.item.startsWith('template auth') && !r.item.startsWith('gallery #/foundations/icons'));
    return { checked: results.length, failures: results.filter(bad), results };
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
