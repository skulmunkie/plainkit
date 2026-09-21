// The thin bridge between Blazor and the toolkit's tool modules. Everything else is the toolkit itself, served next to this file
// under ./plainkit/. Mounted tools are kept by their container element so a component can drive or destroy them later.
const mounted = new Map();

// Wires the pk-* elements and behaviours for the current document (idempotent).
export async function init() {
    const { initPlainkit } = await import('./plainkit/js/plainkit.js');
    initPlainkit();
}

export async function mountCodeExplorer(container, options) {
    const { mountCodeExplorer } = await import('./plainkit/code-explorer/code-explorer.js');
    destroy(container);
    mounted.set(container, await mountCodeExplorer(container, options));
}

export async function mountScorecard(container, options) {
    const { mountScorecard } = await import('./plainkit/scorecard/scorecard.js');
    destroy(container);
    mounted.set(container, await mountScorecard(container, options));
}

export const openFile = (container, path, line) => mounted.get(container)?.openFile?.(path, { line });
export const search = (container, query) => mounted.get(container)?.search?.(query);
export const run = container => mounted.get(container)?.run?.();

export function destroy(container) {
    mounted.get(container)?.destroy?.();
    mounted.delete(container);
}

export async function mountPerformance(container, options) {
    const { mountPerformance } = await import('./plainkit/performance/performance.js');
    destroy(container);
    mounted.set(container, await mountPerformance(container, options));
}

export async function mountConsole(container, options) {
    const { mountConsole } = await import('./plainkit/console/console.js');
    destroy(container);
    mounted.set(container, await mountConsole(container, options));
}

export async function mountLogs(container, options) {
    const { mountLogs } = await import('./plainkit/logs/logs.js');
    destroy(container);
    mounted.set(container, await mountLogs(container, options));
}

export async function mountLogSettings(container, options) {
    const { mountLogSettings } = await import('./plainkit/log-settings/log-settings.js');
    destroy(container);
    mounted.set(container, await mountLogSettings(container, options));
}

export async function mountQuality(container, options) {
    const { mountQuality } = await import('./plainkit/quality/quality.js');
    destroy(container);
    mounted.set(container, await mountQuality(container, options));
}

export async function mountThemeEditor(container, options) {
    const { mountThemeEditor } = await import('./plainkit/theme-editor/theme-editor.js');
    destroy(container);
    mounted.set(container, await mountThemeEditor(container, options));
}

// The dev tools: a dock on the page (the container is only the component's marker; the dock is JS's, appended to the body) or inline in the container.
// host is a DotNetObjectReference of PkDevToolsHost: when given, the Blazor panels (blazor-devtools.js) are added to the tabs.
export async function mountDevTools(container, options, host) {
    const { mountDevTools } = await import('./plainkit/devtools/devtools.js');
    destroy(container);
    const panels = host ? (await import('./blazor-devtools.js')).blazorPanels(host) : [];
    // a null option means "not set" (.NET sends null for it): leave it out so the module's own default applies
    const { mode, ...rest } = Object.fromEntries(Object.entries(options).filter(([, v]) => v !== null));
    mounted.set(container, await mountDevTools(mode === 'inline' ? container : null, { mode, ...rest, panels }));
}

export const openTools = container => mounted.get(container)?.open?.();
export const closeTools = container => mounted.get(container)?.close?.();
export const toggleTools = container => mounted.get(container)?.toggle?.();
export const selectTool = (container, id) => mounted.get(container)?.select?.(id);
export const toolsOpen = container => mounted.get(container)?.isOpen?.() ?? false;
export const exportTheme = container => mounted.get(container)?.export?.() ?? null;
export const setThemeMode = (container, name) => mounted.get(container)?.setTheme?.(name);

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
