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
