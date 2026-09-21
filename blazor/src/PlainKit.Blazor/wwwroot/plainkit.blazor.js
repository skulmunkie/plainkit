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

// Wires the pk-* elements and behaviours for the current document (idempotent).
export async function init() {
    const { initPlainkit } = await import('./plainkit/js/plainkit.js');
    initPlainkit();
}

export const mountCodeExplorer = (container, options) => mountTool(container, () => import('./plainkit/code-explorer/code-explorer.js'), 'mountCodeExplorer', options);

export const mountScorecard = (container, options) => mountTool(container, () => import('./plainkit/scorecard/scorecard.js'), 'mountScorecard', options);

export const openFile = (container, path, line) => mounted.get(container)?.openFile?.(path, { line });
export const search = (container, query) => mounted.get(container)?.search?.(query);
export const run = container => mounted.get(container)?.run?.();

export function destroy(container) {
    current.delete(container);
    unmount(container);
}

export const mountPerformance = (container, options) => mountTool(container, () => import('./plainkit/performance/performance.js'), 'mountPerformance', options);

export const mountConsole = (container, options) => mountTool(container, () => import('./plainkit/console/console.js'), 'mountConsole', options);

export const mountLogs = (container, options) => mountTool(container, () => import('./plainkit/logs/logs.js'), 'mountLogs', options);

export const mountLogSettings = (container, options) => mountTool(container, () => import('./plainkit/log-settings/log-settings.js'), 'mountLogSettings', options);

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
