// Measure a page in a real browser: Core Web Vitals-style timings (largest paint, layout shift, long tasks, slowest interaction) read from
// buffered PerformanceObservers, the style-recalculation cost of a theme switch, and an off-screen iframe harness that loads one of your own
// pages and reports its vitals, load time and DOM size. Any app can measure its own pages with it; the SDK scorecard is one consumer.
// Only same-origin pages can be measured (the browser blocks reading a frame from another origin). Framework-free; imports the logger only.

import { createLogger } from './log.js';

const log = createLogger('measure');

// Observe the page's own timings from load (buffered, so late callers still see the whole load). Returns the live object
// { lcp: ms | null, cls, longTasks, inp: ms }; a metric the browser cannot observe stays at its start value.
export function watchVitals(win = window) {
    const v = { lcp: null, cls: 0, longTasks: 0, inp: 0 };
    const observe = (type, fn, extra = {}) => {
        try { new win.PerformanceObserver(l => l.getEntries().forEach(fn)).observe({ type, buffered: true, ...extra }); } catch (error) { log.debug(`the ${type} entry type is not supported in this browser: the metric stays unmeasured`, error); }
    };
    observe('largest-contentful-paint', e => { v.lcp = e.startTime; });
    observe('layout-shift', e => { if (!e.hadRecentInput) v.cls += e.value; });
    observe('longtask', () => { v.longTasks++; });
    observe('event', e => { v.inp = Math.max(v.inp, e.duration); }, { durationThreshold: 16 });
    return v;
}

// Flip data-theme and re-read every element's colour: the style recalculation cost of a theme switch, in ms. The theme is put back.
export function recalcMs(doc = document) {
    const root = doc.documentElement;
    const was = root.getAttribute('data-theme');
    const t0 = performance.now();
    root.setAttribute('data-theme', was === 'dark' ? 'light' : 'dark');
    doc.querySelectorAll('*').forEach(el => doc.defaultView.getComputedStyle(el).color);
    const ms = performance.now() - t0;
    if (was === null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', was);
    return ms;
}

// Load `url` (same origin) in an off-screen iframe of `width` px inside `host`, wait `settleMs` after its load event so late layout shifts
// register, and resolve { loadMs, nodes, lcp, cls, longTasks, inp }. The frame is removed. Rejects when the page does not load within
// `timeoutMs` or cannot be read.
export function measurePage(url, { host = document.body, width = 1280, height = 800, settleMs = 1000, timeoutMs = 15000 } = {}) {
    return new Promise((resolve, reject) => {
        const f = host.ownerDocument.createElement('iframe');
        f.style.cssText = `position:absolute;left:-10000px;top:0;width:${width}px;height:${height}px;border:0`;
        f.setAttribute('aria-hidden', 'true');
        const t0 = performance.now();
        const done = fn => { clearTimeout(timer); f.remove(); fn(); };
        const timer = setTimeout(() => done(() => reject(new Error(`${url}: did not load within ${timeoutMs} ms`))), timeoutMs);
        f.addEventListener('load', () => {
            const loadMs = performance.now() - t0;
            let vitals;
            try { vitals = watchVitals(f.contentWindow); f.contentDocument.body; } catch (error) { done(() => reject(new Error(`${url}: cannot be read (another origin?)`, { cause: error }))); return; }
            setTimeout(() => done(() => resolve({ loadMs, nodes: f.contentDocument.getElementsByTagName('*').length, ...vitals })), settleMs);
        }, { once: true });
        f.src = url;
        host.append(f);
    });
}
