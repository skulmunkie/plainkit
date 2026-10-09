// The thin bridge between Blazor and the toolkit's tool modules. Everything else is the toolkit itself, served next to this file
// under ./plainkit/. Mounted tools are kept by their container element so a component can drive or destroy them later.
const mounted = new Map();
// The mount that is current for a container. A dispose (destroy) or a newer mount makes an older one, still waiting on its import, give up
// instead of leaving a tool running in a container that is gone.
const current = new WeakMap();

async function mountTool(container, load, name, options) {
    const token = {};
    current.set(container, token);
    unmount(container);
    const module = await load();
    if (current.get(container) !== token) return;
    const handle = await module[name](container, options);
    if (current.get(container) !== token) { handle?.destroy?.(); return; }
    mounted.set(container, handle);
}

function unmount(container) {
    mounted.get(container)?.destroy?.();
    mounted.delete(container);
}

// Wires the pk-* elements and behaviours for the current document (idempotent). js/init.js has initPlainkit alone, so a page that only
// renders Pk* components does not also fetch the dynamic-value, theming and colour helpers (mountThemeEditor imports theme-editor.js,
// which brings its own).
export async function init() {
    const { initPlainkit } = await import('./plainkit/js/init.js');
    initPlainkit();
}

// `lazy` ({ files, reader }, from PkCodeExplorer with an in-memory snapshot): the explorer's LazyProvider over a lean file list, each file's text read through the .NET reader
// on first use. The provider's fetch is told to ask the reader instead of the network (the URLs it builds are 'pk-source/<path>').
export const mountCodeExplorer = async (container, { lazy, ...options }) => {
    if (lazy) {
        const { LazyProvider } = await import('./plainkit/modules/code-explorer/providers.js');
        const read = async url => {
            const text = await lazy.reader.invokeMethodAsync('Read', decodeURIComponent(url.slice('pk-source/'.length)));
            return text === null ? { ok: false, status: 404, text: async () => '' } : { ok: true, status: 200, text: async () => text };
        };
        options = { ...options, provider: new LazyProvider(lazy.files, 'pk-source', { fetch: read }) };
    }
    return mountTool(container, () => import('./plainkit/modules/code-explorer/code-explorer.js'), 'mountCodeExplorer', options);
};

export const mountScorecard = (container, options) => mountTool(container, () => import('./plainkit/modules/scorecard/scorecard.js'), 'mountScorecard', options);

export const openFile = (container, path, line) => mounted.get(container)?.openFile?.(path, { line });
export const search = (container, query) => mounted.get(container)?.search?.(query);
export const run = container => mounted.get(container)?.run?.();

export function destroy(container) {
    current.delete(container);
    unmount(container);
}

export const mountPerformance = (container, options) => mountTool(container, () => import('./plainkit/modules/performance/performance.js'), 'mountPerformance', options);

export const mountConsole = (container, options) => mountTool(container, () => import('./plainkit/modules/console/console.js'), 'mountConsole', options);

export const mountLogs = (container, options) => mountTool(container, () => import('./plainkit/modules/logs/logs.js'), 'mountLogs', options);

export const mountLogSettings = (container, options) => mountTool(container, () => import('./plainkit/modules/log-settings/log-settings.js'), 'mountLogSettings', options);

export async function mountQuality(container, options) {
    const { mountQuality } = await import('./plainkit/modules/quality/quality.js');
    destroy(container);
    mounted.set(container, await mountQuality(container, options));
}

// host (optional) is a DotNetObjectReference of PkThemeEditorHost: each change of the theme is reported to it with the exported CSS, a moment after typing stops.
// A null option means "not set" (.NET sends null for it): it is left out so the module's own default applies.
export async function mountThemeEditor(container, options, host) {
    const { mountThemeEditor } = await import('./plainkit/modules/theme-editor/theme-editor.js');
    destroy(container);
    let timer = 0;
    let armed = false;   // the editor reports its starting state while it mounts: only later changes are the user's
    const send = host ? ({ css }) => { if (!armed) return; clearTimeout(timer); timer = setTimeout(() => host.invokeMethodAsync('OnChange', css), 250); } : undefined;
    const editor = await mountThemeEditor(container, { ...Object.fromEntries(Object.entries(options).filter(([, v]) => v !== null)), onchange: send });
    armed = true;
    mounted.set(container, { ...editor, destroy() { clearTimeout(timer); editor.destroy(); } });
}

// The dev tools: a dock on the page (the container is only the component's marker; the dock is JS's, appended to the body) or inline in the container.
// host is a DotNetObjectReference of PkDevToolsHost: when given, the Blazor panels (blazor-devtools.js) are added to the tabs.
export async function mountDevTools(container, options, host) {
    const { mountDevTools } = await import('./plainkit/modules/devtools/devtools.js');
    destroy(container);
    const panels = host ? (await import('./blazor-devtools.js')).blazorPanels(host) : [];
    // a null option means "not set" (.NET sends null for it): leave it out so the module's own default applies
    const { mode, ...rest } = Object.fromEntries(Object.entries(options).filter(([, v]) => v !== null));
    mounted.set(container, await mountDevTools(mode === 'inline' ? container : null, { mode, ...rest, panels }));
}

// mountToolDock, wrapping core/modules/tool-dock/tool-dock.js for PkToolDock.razor. Blazor renders each panel's content into its own hidden
// host div (JS never owns Blazor-rendered content, STANDARDS.md "Ownership and reactivity"); panelHosts is [{ id, title, host }] built by the
// component from its registered PkToolDockPanel children, host being that panel's ElementReference. A panel's mount(el) appends the host div
// into the tab body once, and activate/deactivate simply toggle its hidden attribute as the tab is shown or hidden.
export async function mountToolDock(container, options, panelHosts) {
    const { mountToolDock } = await import('./plainkit/modules/tool-dock/tool-dock.js');
    destroy(container);
    const panels = (panelHosts ?? []).map(({ id, title, host }) => ({
        id, title,
        mount(el) {
            el.appendChild(host);
            return { activate: () => { host.hidden = false; }, deactivate: () => { host.hidden = true; } };
        },
    }));
    // a null option means "not set" (.NET sends null for it): leave it out so the module's own default applies
    const { mode, ...rest } = Object.fromEntries(Object.entries(options).filter(([, v]) => v !== null));
    mounted.set(container, await mountToolDock(mode === 'inline' ? container : null, { mode, ...rest, panels }));
}

// A callback property of a page element (pk-tool-page run, pk-settings-page save, pk-list-page load): config is data, so a callback is set from script. host is a DotNetObjectReference
// of PkCallbackHost<TArg>; the element awaits the .NET result and a rejection (a throw in C#) reaches the element's own error handling. host null removes it. refresh: an element
// that already drew without the callback (a list showing its empty state) redraws now; one not yet defined draws with it when it upgrades.
// A call the element can abort (load(query, { signal })) gets an id; its abort signal calls the host's Cancel(id), which cancels the CancellationToken of that call.
let callIds = 0;
const abortable = async (host, arg, signal) => {
    if (!signal) return host.invokeMethodAsync('Invoke', arg);
    const id = ++callIds, cancel = () => host.invokeMethodAsync('Cancel', id);
    signal.addEventListener('abort', cancel, { once: true });
    try { return await host.invokeMethodAsync('Invoke', arg, id); } finally { signal.removeEventListener('abort', cancel); }
};
export const setCallback = (el, name, host, refresh) => { if (host) { el[name] = (arg, opts) => abortable(host, arg, opts?.signal); if (refresh) el.refresh?.(); } else delete el[name]; };

// Runs an element's load again (PkDataTable.ReloadAsync).
export const refresh = el => el.refresh?.();

// Calls one of an element's own methods (PkRecordForm.SubmitAsync -> submit()).
export const call = (el, method) => el[method]?.();

export const openTools =container => mounted.get(container)?.open?.();
export const closeTools = container => mounted.get(container)?.close?.();
export const toggleTools = container => mounted.get(container)?.toggle?.();
export const selectTool = (container, id) => mounted.get(container)?.select?.(id);
export const toolsOpen = container => mounted.get(container)?.isOpen?.() ?? false;
export const exportTheme = container => mounted.get(container)?.export?.() ?? null;
export const setThemeMode = (container, name) => mounted.get(container)?.setTheme?.(name);

// What a form holds right now, by control name (PkRuntime.ReadFormValuesAsync): files are left out, a repeated name keeps its last value.
// A pk-form wraps a native <form>: either element can be passed.
export const formValues = el => Object.fromEntries([...new FormData(el instanceof HTMLFormElement ? el : el.querySelector('form'))].filter(([, v]) => typeof v === 'string'));

// Browser storage for IPkStore (PkStorage): only keys in the store's `pk.` namespace; a blocked storage throws and the .NET side keeps the state in memory.
const storageKey = key => { if (typeof key !== 'string' || !key.startsWith('pk.')) throw new TypeError('storage key outside the pk. namespace'); return key; };
export const storageGet = key => localStorage.getItem(storageKey(key));
export const storageSet = (key, value) => localStorage.setItem(storageKey(key), value);
// The theme IPkTheme applies (the same attribute js/theme.js setTheme writes).
export const applyTheme = name => document.documentElement.setAttribute('data-theme', name === 'light' ? 'light' : 'dark');

// The Plainkit release of the JavaScript assets this page loaded.
export async function version() {
    return (await import('./plainkit/js/version.js')).PK_VERSION;
}

export const log = (container, level, text) => mounted.get(container)?.log?.(level, text);
export const clear = container => mounted.get(container)?.clear?.();
// pause/resume: the performance monitor stops and starts; the logs viewer pauses and resumes what it draws.
export const pause = container => { const m = mounted.get(container); return (m?.pause ?? m?.stop)?.call(m); };
export const resume = container => { const m = mounted.get(container); return (m?.resume ?? m?.start)?.call(m); };
export const sendTest = container => mounted.get(container)?.test?.();
export const save = container => { mounted.get(container)?.save?.(); };
export const reset = container => mounted.get(container)?.reset?.();

// Notifications and dialogs (IPkNotifications, IPkDialogs): one notify manager and one dialogs manager per page, made on first use from the SDK modules (js/notify.js,
// js/dialogs.js). Config comes in as plain data; a dialog answers its result as data (a bool, text or { action, values }, null when cancelled or for an alert). Each
// service instance (one per circuit) has its own dialogs scope, so disposing it cancels its open and queued dialogs.
const managers = {};
const manager = (file, load, make) => managers[file] ??= Promise.all([load(), import('./plainkit/js/loader.js')]).then(([m, l]) => make(m, l.loadElements));
const scopes = new Map();

export async function notify(kind, title, details, duration) {
    const n = await manager('notify', () => import('./plainkit/js/notify.js'), (m, load) => m.createNotify({ container: document.body, load }));
    if (['info', 'success', 'warn', 'error'].includes(kind)) n[kind](title, details, { duration });
}

export async function dialog(scopeId, kind, config) {
    if (!scopes.has(scopeId)) scopes.set(scopeId, (await manager('dialogs', () => import('./plainkit/js/dialogs.js'), (m, load) => m.createDialogs({ container: document.body, load }))).scope());
    return (await scopes.get(scopeId)[kind]?.(config)) ?? null;
}

export function endDialogs(scopeId) {
    scopes.get(scopeId)?.end();
    scopes.delete(scopeId);
}

// Logging. configureLogging applies the app's settings to the SDK logger; writeLog is how .NET writes into it (IPkLog); the forwarder is a
// sink that hands entries to a .NET object, which writes them to ILogger.
let stopForwarding = null;
let writingFromDotNet = false; // log() runs the sinks synchronously, so this flag marks entries that came from .NET and must not go back

export async function configureLogging(config) {
    (await import('./plainkit/js/log.js')).configureLogging(config);
}

export async function writeLog(level, scope, message, detail) {
    const { log } = await import('./plainkit/js/log.js');
    writingFromDotNet = true;
    try { log(level, scope, message, detail ?? undefined); } finally { writingFromDotNet = false; }
}

const detailText = detail => {
    if (detail === undefined || detail === null) return null;
    let text;
    try { text = detail instanceof Error ? (detail.stack || String(detail)) : typeof detail === 'string' ? detail : JSON.stringify(detail); } catch { text = String(detail); }
    return text === undefined ? null : text.length > 4000 ? text.slice(0, 4000) + '...' : text;
};

export async function startLogForwarding(target, minLevel) {
    const { addLogSink, LEVELS } = await import('./plainkit/js/log.js');
    stopLogForwarding();
    const min = Math.max(0, LEVELS.indexOf(minLevel));
    stopForwarding = addLogSink(entry => {
        if (writingFromDotNet || LEVELS.indexOf(entry.level) < min) return;
        target.invokeMethodAsync('Forward', entry.level, entry.scope, entry.message, detailText(entry.detail)).catch(() => { /* the circuit is gone: nobody to forward to */ });
    });
}

export function stopLogForwarding() {
    stopForwarding?.();
    stopForwarding = null;
}
