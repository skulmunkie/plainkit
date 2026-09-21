// The performance monitor as a module: mountPerformance(container, options) shows how the page is doing right now: the Core Web Vitals
// (LCP, CLS, INP, FCP, TTFB), a live frame rate, main-thread long tasks, DOM size, JS heap and what the page loaded. It observes the
// browser's own performance APIs, adds no dependency and makes no network request. Built only from SDK components (pk-stat, pk-table,
// pk-button, pk-card, pk-cluster); nothing here draws its own widgets.
//
//   const perf = await mountPerformance(el, { interval: 1000, history: 60, theme: 'dark', height: '32rem' });
//   perf.snapshot();   // the numbers as an object
//
// Options: target (the document to watch; default the container's), interval (ms between updates, default 1000), history (samples kept
// for the sparklines, default 60), autostart (default true), theme ('dark' | 'light'), height (any CSS length, or 'fill'), onsample (called with each snapshot).
// Returns { start(), stop(), running(), snapshot(), destroy() }. Pure maths lives in js/perf-logic.js. Metrics a browser does not
// expose (INP and heap outside Chromium, for one) show a dash rather than a guess.

import { rate, rateFps, fpsFrom, pushSample, clsFrom, inpFrom, longTaskStats, summarizeResources, formatBytes, formatMs, shortName } from '../../js/perf-logic.js';
import { ensureStyles, styleUrls } from '../../js/mount-support.js';
import { loadElements } from '../../js/loader.js';
import { createLogger } from '../../js/log.js';
const log = createLogger('performance');

const STYLES = ['../../plainkit.css'];
const OWN_STYLES = ['./performance.css'];

export const DEFAULTS = Object.freeze({ interval: 1000, history: 60 });

const TONES = { good: 'positive', warn: 'warning', poor: 'critical', '': 'neutral' };

function h(doc, tag, props = {}, ...children) {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(props)) if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v === true ? '' : v);
    el.append(...children.filter(c => c !== null && c !== undefined));
    return el;
}

// Watches one performance entry type; a browser that lacks it is skipped without complaint.
function observe(win, type, onEntries, extra = {}) {
    try {
        const po = new win.PerformanceObserver(list => onEntries(list.getEntries()));
        po.observe({ type, buffered: true, ...extra });
        return po;
    } catch (error) { log.debug(`the ${type} performance entry type is not supported in this browser`, error); return null; }
}

// The data side: performance observers plus a frame counter. Nothing here touches the page's markup.
export function collect(win, doc, { history = DEFAULTS.history } = {}) {
    const s = { lcp: null, fcp: null, ttfb: null, layoutShifts: [], events: [], longTasks: [], resources: [], frames: [], fps: [], heap: [], nodes: [], raf: 0, running: false };
    const observers = [];
    const nav = win.performance.getEntriesByType?.('navigation')?.[0];
    if (nav && nav.responseStart > 0) s.ttfb = Math.round(nav.responseStart);
    observers.push(
        observe(win, 'largest-contentful-paint', es => { s.lcp = Math.round(es.at(-1).startTime); }),
        observe(win, 'paint', es => { const f = es.find(e => e.name === 'first-contentful-paint'); if (f) s.fcp = Math.round(f.startTime); }),
        observe(win, 'layout-shift', es => s.layoutShifts.push(...es.map(e => ({ startTime: e.startTime, value: e.value, hadRecentInput: e.hadRecentInput })))),
        observe(win, 'event', es => s.events.push(...es.map(e => ({ interactionId: e.interactionId, duration: e.duration }))), { durationThreshold: 40 }),
        observe(win, 'longtask', es => s.longTasks.push(...es.map(e => ({ duration: e.duration })))),
        observe(win, 'resource', es => s.resources.push(...es.map(e => ({ name: e.name, duration: e.duration, transferSize: e.transferSize, initiatorType: e.initiatorType })))),
    );

    const frame = t => {
        if (!s.running) return;
        s.frames.push(t);
        while (s.frames.length && s.frames[0] < t - 2000) s.frames.shift();
        s.raf = win.requestAnimationFrame(frame);
    };

    return {
        start() { if (s.running) return; s.running = true; s.frames = []; s.raf = win.requestAnimationFrame(frame); },
        stop() { s.running = false; win.cancelAnimationFrame(s.raf); },
        running: () => s.running,
        // Takes a sample (fps, heap and DOM size) and returns everything as one object.
        sample() {
            const now = s.frames.at(-1) ?? 0;
            const fps = s.running && !doc.hidden ? fpsFrom(s.frames, now) : null;
            const heap = win.performance.memory?.usedJSHeapSize ?? null;
            const nodes = doc.getElementsByTagName('*').length;
            if (fps !== null) s.fps = pushSample(s.fps, fps, history);
            if (heap !== null) s.heap = pushSample(s.heap, heap, history);
            s.nodes = pushSample(s.nodes, nodes, history);
            return this.snapshot(fps, heap, nodes);
        },
        snapshot(fps = s.fps.at(-1) ?? null, heap = s.heap.at(-1) ?? null, nodes = s.nodes.at(-1) ?? null) {
            return {
                lcp: s.lcp, fcp: s.fcp, ttfb: s.ttfb, cls: Math.round(clsFrom(s.layoutShifts) * 1000) / 1000, inp: inpFrom(s.events),
                fps, heap, nodes, longTasks: longTaskStats(s.longTasks), resources: summarizeResources(s.resources),
                series: { fps: s.fps, heap: s.heap, nodes: s.nodes },
            };
        },
        destroy() { this.stop(); for (const o of observers) o?.disconnect(); },
    };
}

export async function mountPerformance(container, options = {}) {
    log.debug('mounted', { module: 'performance', options: Object.keys(options) });
    const { theme, height, autostart = true, interval = DEFAULTS.interval, history = DEFAULTS.history, onsample } = options;
    const doc = container.ownerDocument;
    const win = options.target?.defaultView ?? doc.defaultView;
    const watched = options.target ?? doc;
    await ensureStyles([...styleUrls(STYLES, import.meta.url), ...styleUrls(OWN_STYLES, import.meta.url)], doc);

    const stats = Object.fromEntries([['lcp', 'LCP'], ['inp', 'INP'], ['cls', 'CLS'], ['fcp', 'FCP'], ['ttfb', 'TTFB'], ['fps', 'Frame rate'], ['tasks', 'Long tasks'], ['nodes', 'DOM nodes'], ['heap', 'JS heap']]
        .map(([key, label]) => [key, h(doc, 'pk-stat', { label, tile: true })]));
    const toggle = h(doc, 'pk-button', { size: 'mini', variant: 'ghost' });
    const status = h(doc, 'span', { class: 'muted', role: 'status' });
    const kinds = h(doc, 'p', { class: 'muted' });
    const resources = h(doc, 'pk-table', { label: 'Slowest requests', density: 'compact', columns: JSON.stringify([{ key: 'name', label: 'Request' }, { key: 'time', label: 'Time', align: 'end' }, { key: 'size', label: 'Size', align: 'end' }]) });
    const root = h(doc, 'section', { 'aria-label': 'Performance monitor', class: 'pf-module' },
        h(doc, 'pk-cluster', {}, h(doc, 'h2', {}, 'Performance'), toggle, status),
        h(doc, 'pk-cluster', { align: 'stretch' }, ...Object.values(stats)),
        h(doc, 'pk-card', { heading: 'What loaded', level: 3 }, kinds, resources));
    if (theme) root.setAttribute('data-theme', theme);
    if (height) { root.style.setProperty('height', height === 'fill' ? '100%' : height); root.style.setProperty('overflow', 'auto'); }
    container.replaceChildren(root);
    loadElements(root);

    const c = collect(win, watched, { history });
    let timer = 0;
    let last = null;
    let rowsKey = '';

    const set = (el, { value, tone = '', subtext = '', values }) => {
        el.setAttribute('value', value); el.setAttribute('tone', TONES[tone] ?? 'neutral'); el.setAttribute('subtext', subtext);
        if (values && values.length > 1) el.setAttribute('values', JSON.stringify(values)); else el.removeAttribute('values');
    };

    function draw(snap) {
        last = snap;
        const limit = win.performance.memory?.jsHeapSizeLimit;
        const heapShare = snap.heap !== null && limit ? snap.heap / limit : null;
        set(stats.lcp, { value: snap.lcp === null ? '-' : formatMs(snap.lcp), tone: rate('lcp', snap.lcp), subtext: 'Largest paint, good up to 2.5 s' });
        set(stats.inp, { value: snap.inp === null ? '-' : formatMs(snap.inp), tone: rate('inp', snap.inp), subtext: 'Slowest interaction, good up to 200 ms' });
        set(stats.cls, { value: snap.cls.toFixed(3), tone: rate('cls', snap.cls), subtext: 'Layout shift, good up to 0.1' });
        set(stats.fcp, { value: snap.fcp === null ? '-' : formatMs(snap.fcp), tone: rate('fcp', snap.fcp), subtext: 'First paint, good up to 1.8 s' });
        set(stats.ttfb, { value: snap.ttfb === null ? '-' : formatMs(snap.ttfb), tone: rate('ttfb', snap.ttfb), subtext: 'First byte, good up to 0.8 s' });
        set(stats.fps, { value: snap.fps === null ? '-' : `${snap.fps} fps`, tone: rateFps(snap.fps), subtext: c.running() ? 'Live' : 'Paused', values: snap.series.fps });
        set(stats.tasks, { value: String(snap.longTasks.count), tone: rate('longTask', snap.longTasks.worst), subtext: `${snap.longTasks.blocking} ms blocking, worst ${snap.longTasks.worst} ms` });
        set(stats.nodes, { value: String(snap.nodes ?? '-'), subtext: 'Elements in the document', values: snap.series.nodes });
        set(stats.heap, { value: snap.heap === null ? 'n/a' : formatBytes(snap.heap), tone: heapShare === null ? '' : heapShare < 0.5 ? 'good' : heapShare < 0.8 ? 'warn' : 'poor', subtext: snap.heap === null ? 'Not exposed by this browser' : 'Used (Chromium only)', values: snap.series.heap });
        const r = snap.resources;
        kinds.textContent = `${r.count} requests, ${formatBytes(r.bytes)}. ${Object.entries(r.byType).map(([t, b]) => `${t} ${b.count}`).join(', ')}`;
        const rows = r.slowest.map((x, i) => ({ id: i + 1, name: shortName(x.name), time: formatMs(x.duration), size: formatBytes(x.bytes) }));
        const key = JSON.stringify(rows);
        if (key !== rowsKey) { rowsKey = key; resources.setAttribute('rows', key); }
        onsample?.(snap);
    }

    const tick = () => draw(c.sample());
    const paintButton = () => { const on = c.running(); toggle.textContent = on ? 'Pause' : 'Resume'; status.textContent = on ? `Updating every ${interval / 1000} s` : 'Paused'; };
    function start() { c.start(); win.clearInterval(timer); timer = win.setInterval(tick, interval); paintButton(); }
    function stop() { c.stop(); win.clearInterval(timer); timer = 0; paintButton(); if (last) draw(last); }
    toggle.addEventListener('click', () => (c.running() ? stop() : start()));

    draw(c.snapshot());
    paintButton();
    if (autostart) start();
    return {
        start, stop, running: c.running, snapshot: () => c.sample(),
        destroy() { win.clearInterval(timer); c.destroy(); root.remove(); },
    };
}
