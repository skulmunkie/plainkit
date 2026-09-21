// The built-in log outputs that show something on the page: toast (a pk-toast) and alert (a pk-alert notice at the top of the page).
// They register themselves with js/log.js when this module is imported, and log.js imports it the first time a route names one of them:
//
//   configureLogging({ routes: { error: ['console', 'toast'], warn: ['console', 'alert'] } });
//
// Both are built only from SDK elements (pk-toast-stack, pk-alert), loaded through the SDK's loader. Repeated messages are folded into
// one (a count in the heading) so a failing loop does not flood the page. Pure helpers are exported for tests.

import { registerLogOutput } from './log.js';

// pk-toast and pk-alert both take kind: info, success, warning, danger.
export const KIND = Object.freeze({ debug: 'info', info: 'info', warn: 'warning', error: 'danger' });
export const kindFor = level => KIND[level] ?? 'info';

// Folds an entry into a list of shown notices: an entry with the same level, scope and message as one already shown bumps its count
// instead of adding another. Returns { list, entry, isNew } without mutating the input. Pure.
export function foldEntry(list, entry, max = 5) {
    const key = `${entry.level}|${entry.scope}|${entry.message}`;
    const i = list.findIndex(x => x.key === key);
    if (i >= 0) { const next = list.slice(); next[i] = { ...next[i], count: next[i].count + 1 }; return { list: next, entry: next[i], isNew: false }; }
    const item = { key, level: entry.level, scope: entry.scope, message: entry.message, count: 1 };
    return { list: [...list, item].slice(-max), entry: item, isNew: true };
}

export const headingFor = item => `${item.scope}${item.count > 1 ? ` (x${item.count})` : ''}`;

// ---- toast -------------------------------------------------------------------------------------------------------------------
let toastReady = null;
async function ensureToast() {
    if (globalThis.PkToast) return globalThis.PkToast;
    toastReady ??= (async () => {
        const registry = new URL('../elements/registry.js', import.meta.url).href;
        const map = (await import(registry)).default;
        await import(new URL(map['pk-toast-stack'], registry).href);
        return globalThis.PkToast;
    })();
    return toastReady;
}
let shownToasts = [];
const toastOutput = async entry => {
    const folded = foldEntry(shownToasts, entry, 20);
    shownToasts = folded.list;
    if (!folded.isNew) return; // the same message is already on screen: it counts, it does not stack
    const PkToast = await ensureToast();
    PkToast?.show(entry.message, { kind: kindFor(entry.level), heading: entry.scope, duration: entry.level === 'error' ? 0 : 6000 });
    setTimeout(() => { shownToasts = shownToasts.filter(x => x.key !== folded.entry.key); }, 6000);
};

// ---- alert -------------------------------------------------------------------------------------------------------------------
let alertList = [];
let alertRegion = null;
const alertNodes = new Map();

async function ensureAlerts() {
    const doc = globalThis.document;
    if (!doc?.body) return null;
    if (!alertRegion?.isConnected) {
        alertRegion = doc.createElement('div');
        alertRegion.setAttribute('role', 'region');
        alertRegion.setAttribute('aria-label', 'Notices');
        alertRegion.setAttribute('data-pk-log-alerts', '');
        doc.body.prepend(alertRegion);
        alertNodes.clear();
        const { loadElements } = await import('./loader.js');
        loadElements(alertRegion).catch(() => {});
    }
    return alertRegion;
}

const alertOutput = async entry => {
    const region = await ensureAlerts();
    if (!region) return;
    const folded = foldEntry(alertList, entry, 5);
    alertList = folded.list;
    const item = folded.entry;
    let node = alertNodes.get(item.key);
    if (!node) {
        node = globalThis.document.createElement('pk-alert');
        node.setAttribute('dismissible', '');
        node.setAttribute('compact', '');
        node.setAttribute('kind', kindFor(item.level));
        node.textContent = item.message;
        node.addEventListener('pk-dismiss', () => { alertNodes.delete(item.key); alertList = alertList.filter(x => x.key !== item.key); });
        region.append(node);
        alertNodes.set(item.key, node);
    }
    node.setAttribute('heading', headingFor(item));
    // Keep at most five notices on the page: drop the oldest nodes that folded out of the list.
    for (const [key, n] of alertNodes) if (!alertList.some(x => x.key === key)) { n.remove(); alertNodes.delete(key); }
};

registerLogOutput('toast', toastOutput);
registerLogOutput('alert', alertOutput);
