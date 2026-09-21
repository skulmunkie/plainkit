// The logs viewer as a module: mountLogs(container, options) is a live view of what the SDK and the app logged through js/log.js
// (createLogger('checkout').warn(...)): the entries already in the ring buffer when it mounts, then every new one as it happens, whatever
// the console level (an entry below it is in the buffer only and is marked "buffered only"). Filter by minimum level, scope and text; a
// row shows its detail (objects as JSON, an Error with its stack); copy, export and import as JSON; pause the view; clear. Built only
// from SDK components (pk-table, pk-input, pk-select, pk-button, pk-button-group, pk-badge, pk-card, pk-code-block, pk-empty-state,
// pk-cluster, pk-stack); it draws nothing itself.
//
//   const logs = await mountLogs(el, { level: 'info', height: '28rem' });
//   logs.pause(); logs.resume(); logs.select(3); logs.entries();
//
// Options: level (the minimum level shown first: debug, info, warn or error; default debug), scopes (scopes selected first), max (entries
// kept, default 1000), order ('newest' first, the default, or 'oldest'), theme, height (any CSS length, or 'fill').
// Returns { pause(), resume(), isPaused(), clear(), entries(), select(id), filter({ level, scopes, text }), destroy() }. pause() freezes what
// is drawn (entries keep arriving and show on resume()). clear() empties the view and the SDK's ring buffer. Pure logic is js/log-view-logic.js.

import { addLogSink, getLogBuffer, getLoggingConfig, clearLogBuffer } from '../../js/log.js';
import { VIEW_LEVELS, filterLogEntries, scopesOf, countLevels, rowFor, describeDetail, pushLog, serializeEntries, parseImport, mergeEntries, formatTime, routeOf } from '../../js/log-view-logic.js';
import { ensureStyles, styleUrls } from '../../js/mount-support.js';
import { loadElements } from '../../js/loader.js';

const STYLES = ['../../plainkit.css'];
const OWN_STYLES = ['./logs.css'];

export const DEFAULTS = Object.freeze({ max: 1000, level: 'debug', order: 'newest' });
const LEVEL_LABEL = { debug: 'Debug', info: 'Info', warn: 'Warn', error: 'Error' };
const LEVEL_TONE = { debug: 'muted', info: 'outline', warn: 'warn', error: 'danger' };
const COLUMNS = [{ key: 'time', label: 'Time' }, { key: 'level', label: 'Level' }, { key: 'scope', label: 'Scope' }, { key: 'message', label: 'Message' }, { key: 'output', label: 'Output', hidePhone: true }];

function h(doc, tag, props = {}, ...children) {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(props)) if (v !== undefined && v !== null && v !== false) el.setAttribute(k, v === true ? '' : v);
    el.append(...children.filter(c => c !== null && c !== undefined));
    return el;
}

export async function mountLogs(container, options = {}) {
    const { theme, height, max = DEFAULTS.max } = options;
    const doc = container.ownerDocument;
    const win = doc.defaultView;
    await ensureStyles([...styleUrls(STYLES, import.meta.url), ...styleUrls(OWN_STYLES, import.meta.url)], doc);

    let entries = [];
    let nextId = 1;
    let minLevel = VIEW_LEVELS.includes(options.level) ? options.level : DEFAULTS.level;
    let scopes = [...(options.scopes ?? [])];
    let text = '';
    let newestFirst = (options.order ?? DEFAULTS.order) !== 'oldest';
    let paused = false;
    let selected = null;
    let note = '';
    let drawnScopes = '';

    // ---- the shell: SDK components only ---------------------------------------------------------------------------------------
    const search = h(doc, 'pk-input', { type: 'search', label: 'Filter the log', placeholder: 'Filter messages', clearable: true, debounce: 150 });
    const levels = h(doc, 'pk-button-group', { label: 'Minimum level', mode: 'single' },
        ...VIEW_LEVELS.map(v => h(doc, 'pk-button', { toggle: true, variant: 'ghost', size: 'mini', value: v, pressed: v === minLevel }, LEVEL_LABEL[v])));
    const scopeSelect = h(doc, 'pk-select', { label: 'Scopes (none selected shows all)', multiple: true });
    const badges = Object.fromEntries(VIEW_LEVELS.map(v => [v, h(doc, 'pk-badge', { variant: LEVEL_TONE[v] })]));
    const status = h(doc, 'span', { class: 'muted', role: 'status' });
    const pause = h(doc, 'pk-button', { size: 'mini', variant: 'ghost', toggle: true }, 'Pause');
    const order = h(doc, 'pk-button', { size: 'mini', variant: 'ghost', toggle: true, pressed: newestFirst }, 'Newest first');
    const clear = h(doc, 'pk-button', { size: 'mini', variant: 'ghost' }, 'Clear');
    const copy = h(doc, 'pk-button', { size: 'mini', variant: 'ghost' }, 'Copy as JSON');
    const exportBtn = h(doc, 'pk-button', { size: 'mini', variant: 'ghost' }, 'Export');
    const importBtn = h(doc, 'pk-button', { size: 'mini', variant: 'ghost' }, 'Import');
    const file = h(doc, 'input', { type: 'file', accept: '.json,application/json', hidden: true, 'aria-label': 'Import a log file' });
    const table = h(doc, 'pk-table', { label: 'Log entries', density: 'compact', stickyHeader: true, clickable: true, manual: true, cards: true, maxHeight: '18rem', columns: JSON.stringify(COLUMNS) },
        h(doc, 'pk-empty-state', { slot: 'empty', heading: 'No log entries', tone: 'compact', description: 'Entries appear here as the SDK or your code logs them.' }));
    const detail = h(doc, 'div', { class: 'lg-detail', hidden: true });

    const root = h(doc, 'section', { class: 'lg-module', 'aria-label': 'Logs' },
        h(doc, 'pk-stack', { gap: 'sm' },
            h(doc, 'pk-cluster', {}, search, levels, scopeSelect),
            h(doc, 'pk-cluster', {}, ...VIEW_LEVELS.map(v => badges[v]), status),
            h(doc, 'pk-cluster', {}, pause, order, clear, copy, exportBtn, importBtn, file),
            table, detail));
    if (theme) root.setAttribute('data-theme', theme);
    if (height) { root.style.setProperty('height', height === 'fill' ? '100%' : height); root.style.setProperty('overflow', 'auto'); }
    container.replaceChildren(root);
    loadElements(root).catch(() => { /* loadElements logs its own failures */ });

    // ---- drawing --------------------------------------------------------------------------------------------------------------
    const setAttr = (el, k, v) => { if (el.getAttribute(k) !== v) el.setAttribute(k, v); };
    const shown = () => filterLogEntries(entries, { minLevel, scopes, text });

    function drawScopes() {
        const all = scopesOf(entries, scopes);
        const key = all.join('\n');
        if (key === drawnScopes) return;
        drawnScopes = key;
        scopeSelect.replaceChildren(...all.map(s => h(doc, 'option', { value: s, selected: scopes.includes(s) }, s)));
        if (all.length) scopeSelect.setAttribute('value', scopes.join(','));
    }

    function drawDetail() {
        const entry = entries.find(e => e.id === selected);
        if (!entry) { detail.hidden = true; detail.replaceChildren(); return; }
        const d = describeDetail(entry.detail);
        const route = routeOf(entry, getLoggingConfig());
        const close = h(doc, 'pk-button', { size: 'mini', variant: 'ghost', slot: 'actions' }, 'Close');
        close.addEventListener('click', () => api.select(null));
        const facts = `${formatTime(entry.at)}, scope ${entry.scope}${route.below ? `, below the ${route.needed} level so not sent to any output` : ''}${entry.imported ? ', imported' : ''}`;
        const card = h(doc, 'pk-card', { heading: `${LEVEL_LABEL[entry.level]}: ${entry.scope}`, level: 4 }, close,
            h(doc, 'pk-stack', { gap: 'xs' },
                h(doc, 'span', { class: 'muted' }, facts),
                h(doc, 'p', { class: 'lg-message' }, entry.message),
                d.kind === 'none' ? null : h(doc, 'pk-code-block', { label: d.kind === 'error' ? 'Error stack' : d.kind === 'text' ? 'Detail' : 'Detail (JSON)', wrap: true, maxHeight: '14rem' }, d.text)));
        detail.replaceChildren(card);
        detail.hidden = false;
        loadElements(detail).catch(() => { /* loadElements logs its own failures */ });
    }

    function render() {
        if (paused) { status.textContent = `Paused, ${entries.length} kept`; return; }
        const config = getLoggingConfig();
        const list = shown();
        const counts = countLevels(entries);
        for (const v of VIEW_LEVELS) badges[v].textContent = `${LEVEL_LABEL[v]} ${counts[v]}`;
        const ordered = newestFirst ? list.slice().reverse() : list;
        setAttr(table, 'rows', JSON.stringify(ordered.map(e => rowFor(e, config))));
        status.textContent = `${list.length} of ${entries.length} shown${note ? `. ${note}` : ''}`;
        drawScopes();
        if (selected !== null) drawDetail();
    }
    let queued = 0;
    const schedule = () => { if (!queued) queued = win.setTimeout(() => { queued = 0; render(); }, 100); };

    // ---- the feed: the buffer first, then the live sink --------------------------------------------------------------------------
    const add = entry => { entries = pushLog(entries, { ...entry, id: nextId++ }, max); schedule(); };
    for (const entry of getLogBuffer()) entries = pushLog(entries, { ...entry, id: nextId++ }, max);
    const unsink = addLogSink(add);

    // ---- controls -------------------------------------------------------------------------------------------------------------
    search.addEventListener('pk-search', e => { text = e.detail.value ?? ''; render(); });
    levels.addEventListener('pk-toggle', e => {
        const b = e.target.closest('pk-button');
        if (b?.getAttribute('value') && (e.detail?.pressed ?? true)) { minLevel = b.getAttribute('value'); render(); }
    });
    scopeSelect.addEventListener('pk-value-change', e => { scopes = String(e.detail.value ?? '').split(',').filter(Boolean); drawnScopes = ''; render(); });
    pause.addEventListener('pk-toggle', e => (e.detail?.pressed ? api.pause() : api.resume()));
    order.addEventListener('pk-toggle', e => { newestFirst = Boolean(e.detail?.pressed); render(); });
    clear.addEventListener('click', () => api.clear());
    table.addEventListener('pk-row-click', e => api.select(Number(e.detail?.id)));
    copy.addEventListener('click', async () => {
        try { await win.navigator.clipboard.writeText(serializeEntries(shown())); note = 'Copied as JSON'; } catch { note = 'Copy was blocked by the browser'; }
        render();
    });
    exportBtn.addEventListener('click', () => {
        const url = win.URL.createObjectURL(new win.Blob([serializeEntries(shown())], { type: 'application/json' }));
        const a = h(doc, 'a', { href: url, download: `plainkit-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json` });
        doc.body.append(a); a.click(); a.remove();
        win.setTimeout(() => win.URL.revokeObjectURL(url), 1000);
    });
    importBtn.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
        const chosen = file.files?.[0];
        file.value = '';
        if (!chosen) return;
        const result = parseImport(await chosen.text());
        if (result.error) note = result.error;
        else {
            const merged = mergeEntries(entries, result.entries, nextId, max);
            entries = merged.entries; nextId = merged.nextId;
            note = `Imported ${result.entries.length}${result.skipped ? `, skipped ${result.skipped}` : ''}`;
        }
        render();
    });
    // The console level can change in the Logging panel or in code: the Output column follows within a moment.
    const timer = win.setInterval(() => { if (!paused && entries.length) render(); }, 3000);

    render();
    const api = {
        pause() { paused = true; pause.setAttribute('pressed', ''); render(); },
        resume() { paused = false; pause.removeAttribute('pressed'); render(); },
        isPaused: () => paused,
        clear() { entries = []; selected = null; note = ''; drawnScopes = ''; clearLogBuffer(); detail.hidden = true; detail.replaceChildren(); if (paused) api.resume(); else render(); },
        entries: () => entries.slice(),
        select(id) { selected = Number.isFinite(id) && entries.some(e => e.id === id) ? id : null; drawDetail(); },
        filter(next = {}) {
            if (VIEW_LEVELS.includes(next.level)) { minLevel = next.level; levels.querySelectorAll('pk-button').forEach(b => (b.getAttribute('value') === minLevel ? b.setAttribute('pressed', '') : b.removeAttribute('pressed'))); }
            if (Array.isArray(next.scopes)) { scopes = [...next.scopes]; drawnScopes = ''; }
            if (typeof next.text === 'string') { text = next.text; search.setAttribute('value', text); }
            render();
        },
        destroy() { unsink(); win.clearInterval(timer); win.clearTimeout(queued); root.remove(); },
    };
    return api;
}
