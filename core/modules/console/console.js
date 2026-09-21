// The dev console as a module: mountConsole(container, options) is a live view of what the page, the SDK and the app are doing:
// everything sent to console.*, uncaught errors and rejected promises, every pk-* event the SDK's elements fire, the network requests
// the page made, which pk-* elements are on the page (and whether each is registered), and the environment (theme, density, viewport,
// preferences, Blazor). Built only from SDK components (pk-tabs, pk-table, pk-input, pk-button, pk-button-group, pk-cluster); it draws nothing itself.
//
//   const dev = await mountConsole(el, { tab: 'console', height: '28rem', theme: 'dark' });
//   dev.log('warn', 'Something to look at');
//
// Options: capture (which feeds to record; any of 'console', 'errors', 'events', 'network'; default all), max (entries kept, default
// 500), events (pk-* event names to record; default: every event in elements/api.json, else a built-in list), tab (first tab shown),
// theme, height (any CSS length, or 'fill'). Returns { log(level, text), clear(), entries(), select(tab), destroy() }.
// There is deliberately no JavaScript prompt: running typed code needs eval, which the SDK's strict CSP (and its security scan) forbids.
// destroy() puts console.* back exactly as it was found.

import { LEVELS, formatArgs, makeEntry, pushEntry, filterEntries, countByLevel, exportEntries, elementInventory, formatArg } from '../../js/console-logic.js';
import { ensureStyles, styleUrls } from '../../js/mount-support.js';
import { loadElements } from '../../js/loader.js';
import { shortName, formatBytes, formatMs } from '../../js/perf-logic.js';
import { PK_VERSION } from '../../js/version.js';

const STYLES = ['../../plainkit.css'];
const OWN_STYLES = ['./console.css'];

export const DEFAULTS = Object.freeze({ max: 500, capture: ['console', 'errors', 'events', 'network'] });

// Used when elements/api.json cannot be read (the SDK source layout has none).
const FALLBACK_EVENTS = ['pk-change', 'pk-value-change', 'pk-dismiss', 'pk-close', 'pk-tab-change', 'pk-tab-close', 'pk-select', 'pk-sort', 'pk-filter', 'pk-toggle', 'pk-activate', 'pk-search', 'pk-row-click', 'pk-copy', 'pk-remove', 'pk-page-change'];

const TABS = [['console', 'Console'], ['events', 'Events'], ['network', 'Network'], ['elements', 'Elements'], ['environment', 'Environment']];
const CONSOLE_METHODS = { debug: 'debug', log: 'log', info: 'info', warn: 'warn', error: 'error' };

function h(doc, tag, props = {}, ...children) {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(props)) if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v === true ? '' : v);
    el.append(...children.filter(c => c !== null && c !== undefined));
    return el;
}

const clock = at => { const d = new Date(at); return `${d.toLocaleTimeString([], { hour12: false })}.${String(d.getMilliseconds()).padStart(3, '0')}`; };

async function eventNames(win, given) {
    if (given?.length) return given;
    try {
        const res = await win.fetch(new URL('../elements/api.json', import.meta.url));
        if (res.ok) return [...new Set((await res.json()).flatMap(e => (e.events ?? []).map(x => x.name)).filter(n => n.startsWith('pk-')))];
    } catch { /* no api.json next to this module */ }
    return FALLBACK_EVENTS;
}

export async function mountConsole(container, options = {}) {
    const { theme, height, tab = 'console', max = DEFAULTS.max } = options;
    const capture = new Set(options.capture ?? DEFAULTS.capture);
    const doc = container.ownerDocument;
    const win = doc.defaultView;
    await ensureStyles([...styleUrls(STYLES, import.meta.url), ...styleUrls(OWN_STYLES, import.meta.url)], doc);

    let entries = [];
    let level = 'debug';
    let text = '';
    let active = TABS.some(([k]) => k === tab) ? tab : 'console';
    let inCapture = false;

    // ---- the page shell: SDK tabs, each panel one SDK table (the console panel adds its toolbar) ------------------------------
    const tables = {};
    const tabs = h(doc, 'pk-tabs', { value: active, label: 'Dev console' });
    const countTabs = {};
    for (const [key, label] of TABS) {
        countTabs[key] = h(doc, 'pk-tab', { value: key }, label);
        tabs.append(countTabs[key]);
    }
    const table = (key, label, columns) => (tables[key] = h(doc, 'pk-table', { label, density: 'compact', stickyHeader: true, maxHeight: '18rem', columns: JSON.stringify(columns) }));
    const logColumns = [{ key: 'time', label: 'Time' }, { key: 'level', label: 'Level' }, { key: 'message', label: 'Message' }];
    const search = h(doc, 'pk-input', { type: 'search', label: 'Filter the log', placeholder: 'Filter', clearable: true, debounce: 150, size: 'sm' });
    const levels = h(doc, 'pk-button-group', { label: 'Minimum level', mode: 'single' },
        ...[['debug', 'All'], ['warn', 'Warnings'], ['error', 'Errors']].map(([v, l]) => h(doc, 'pk-button', { toggle: true, variant: 'ghost', size: 'mini', value: v, pressed: v === 'debug' }, l)));
    const clear = h(doc, 'pk-button', { size: 'mini', variant: 'ghost' }, 'Clear');
    const copy = h(doc, 'pk-button', { size: 'mini', variant: 'ghost' }, 'Copy as JSON');
    const status = h(doc, 'span', { class: 'muted', role: 'status' });
    const panel = (key, ...body) => tabs.append(h(doc, 'pk-tab-panel', { value: key }, ...body));
    panel('console', h(doc, 'pk-cluster', {}, search, levels, clear, copy, status), table('console', 'Console', logColumns));
    panel('events', table('events', 'SDK events', [{ key: 'time', label: 'Time' }, { key: 'message', label: 'Event' }]));
    panel('network', table('network', 'Network', [{ key: 'time', label: 'Time' }, { key: 'message', label: 'Request' }]));
    panel('elements', table('elements', 'pk-* elements on this page', [{ key: 'tag', label: 'Element' }, { key: 'count', label: 'On page', align: 'end' }, { key: 'defined', label: 'Registered' }]));
    panel('environment', table('environment', 'Environment', [{ key: 'name', label: 'Setting' }, { key: 'value', label: 'Value' }]));

    const root = h(doc, 'section', { 'aria-label': 'Dev console', class: 'dc-module' }, tabs);
    if (theme) root.setAttribute('data-theme', theme);
    if (height) { root.style.setProperty('height', height === 'fill' ? '100%' : height); root.style.setProperty('overflow', 'auto'); }
    container.replaceChildren(root);
    loadElements(root).catch(() => {});

    // ---- rendering: throttled, one panel at a time ------------------------------------------------------------------------
    const setRows = (key, rows) => { const s = JSON.stringify(rows); if (tables[key].getAttribute('rows') !== s) tables[key].setAttribute('rows', s); };
    const bySource = source => entries.filter(e => e.source === source);

    function environment() {
        const root = doc.documentElement;
        const media = q => win.matchMedia?.(q).matches;
        return [
            ['Plainkit', PK_VERSION], ['Theme', root.getAttribute('data-theme') ?? 'default'], ['Density', root.getAttribute('data-density') ?? 'default'],
            ['Viewport', `${win.innerWidth} x ${win.innerHeight} at ${win.devicePixelRatio}x`], ['Prefers', `${media('(prefers-color-scheme: dark)') ? 'dark' : 'light'} colour, ${media('(prefers-reduced-motion: reduce)') ? 'reduced' : 'full'} motion`],
            ['Language', root.lang || 'not set'], ['Online', String(win.navigator.onLine)], ['Stylesheets', String(doc.styleSheets.length)],
            ['Custom elements', String(elementInventory([...doc.getElementsByTagName('*')].map(e => e.localName), () => true).length) + ' pk-* kinds'],
            ['Blazor', win.Blazor ? 'present' : 'not on this page'], ['Address', win.location.href], ['Agent', win.navigator.userAgent],
        ].map(([name, value], id) => ({ id, name, value }));
    }

    function render() {
        const shown = filterEntries(bySource('console').concat(bySource('error'), bySource('rejection')).sort((a, b) => a.at - b.at), { minLevel: level, text });
        const counts = countByLevel(entries.filter(e => e.source !== 'event' && e.source !== 'network'));
        countTabs.console.setAttribute('count', String(counts.warn + counts.error));
        status.textContent = `${shown.length} shown, ${counts.error} errors, ${counts.warn} warnings`;
        if (active === 'console') setRows('console', shown.map((e, id) => ({ id, time: clock(e.at), level: e.level, message: e.text })));
        if (active === 'events') setRows('events', bySource('event').map((e, id) => ({ id, time: clock(e.at), message: e.text })));
        if (active === 'network') setRows('network', bySource('network').map((e, id) => ({ id, time: clock(e.at), message: e.text })));
        if (active === 'elements') setRows('elements', elementInventory([...doc.getElementsByTagName('*')].map(e => e.localName), t => win.customElements.get(t)).map(x => ({ id: x.tag, tag: x.tag, count: x.count, defined: x.defined ? 'yes' : 'not loaded' })));
        if (active === 'environment') setRows('environment', environment());
    }
    let queued = 0;
    const schedule = () => { if (!queued) queued = win.setTimeout(() => { queued = 0; render(); }, 100); };
    const record = (lvl, message, meta) => { entries = pushEntry(entries, makeEntry(lvl, message, meta), max); schedule(); };

    // ---- capture, each part undone by destroy() ---------------------------------------------------------------------------
    const undo = [];
    if (capture.has('console')) {
        for (const method of Object.values(CONSOLE_METHODS)) {
            const original = win.console[method];
            win.console[method] = (...args) => {
                original.apply(win.console, args);
                if (inCapture) return; // a log made while formatting one is not recorded again
                inCapture = true;
                try { record(method, formatArgs(args)); } finally { inCapture = false; }
            };
            undo.push(() => { win.console[method] = original; });
        }
    }
    if (capture.has('errors')) {
        const onError = e => record('error', `${e.message}${e.filename ? ` (${shortName(e.filename)}:${e.lineno})` : ''}`, { source: 'error' });
        const onReject = e => record('error', `Unhandled rejection: ${formatArg(e.reason)}`, { source: 'rejection' });
        win.addEventListener('error', onError); win.addEventListener('unhandledrejection', onReject);
        undo.push(() => { win.removeEventListener('error', onError); win.removeEventListener('unhandledrejection', onReject); });
    }
    if (capture.has('events')) {
        const names = await eventNames(win, options.events);
        const onEvent = e => { const t = e.composedPath?.()[0] ?? e.target; record('info', `${e.type} on <${t?.localName ?? '?'}${t?.id ? `#${t.id}` : ''}> ${e.detail === undefined || e.detail === null ? '' : formatArg(e.detail)}`.trim(), { source: 'event' }); };
        for (const n of names) doc.addEventListener(n, onEvent, true);
        undo.push(() => { for (const n of names) doc.removeEventListener(n, onEvent, true); });
    }
    if (capture.has('network') && typeof win.PerformanceObserver === 'function') {
        try {
            const po = new win.PerformanceObserver(list => { for (const r of list.getEntries()) record('info', `${shortName(r.name)}  ${formatMs(r.duration)}  ${formatBytes(r.transferSize)}  (${r.initiatorType})`, { source: 'network', at: Date.now() }); });
            po.observe({ type: 'resource', buffered: true });
            undo.push(() => po.disconnect());
        } catch { /* resource timing unavailable */ }
    }

    // ---- controls ---------------------------------------------------------------------------------------------------------
    tabs.addEventListener('pk-tab-change', e => { active = e.detail.value; render(); });
    search.addEventListener('pk-search', e => { text = e.detail.value ?? ''; render(); });
    levels.addEventListener('pk-toggle', e => { const b = e.target.closest('pk-button'); if (b?.getAttribute('value') && (e.detail?.pressed ?? true)) { level = b.getAttribute('value'); render(); } });
    clear.addEventListener('click', () => { entries = []; render(); });
    copy.addEventListener('click', () => win.navigator.clipboard?.writeText(exportEntries(filterEntries(entries, { minLevel: level, text }))).catch(() => {}));
    const timer = win.setInterval(() => { if (active === 'elements' || active === 'environment') render(); }, 2000);

    render();
    return {
        log: (lvl, message) => record(LEVELS.includes(lvl) ? lvl : 'log', String(message)),
        clear: () => { entries = []; render(); },
        entries: () => entries.slice(),
        select: key => { if (TABS.some(([k]) => k === key)) { active = key; tabs.setAttribute('value', key); render(); } },
        destroy() { win.clearInterval(timer); win.clearTimeout(queued); for (const u of undo.reverse()) u(); root.remove(); },
    };
}
