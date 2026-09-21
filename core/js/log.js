// SDK logging: one small logger every part of the SDK uses, so a page mistake or a failure is never silent, and the same logger is there
// for an app's own messages (createLogger('checkout')).
//
//   import { createLogger } from './log.js';
//   const log = createLogger('invokers');
//   log.warn('data-open="#nope" matched no element', { control });
//
// Levels, lowest first: debug, info, warn, error, silent. An entry is emitted when its level is at or above the level for its scope
// (a per-scope level wins over the global one). Emitted entries go to the OUTPUTS the routing names for that level:
//   console   the browser console (built in)
//   toast     a pk-toast (loaded on first use)          alert   a pk-alert notice at the top of the page (loaded on first use)
//   your own  registerLogOutput('telemetry', entry => ...)
// The default routing sends every level to the console only and the default level is 'warn', so a production page stays quiet.
// Configure in code:
//   configureLogging({ level: 'info', scopes: { loader: 'debug' }, routes: { error: ['console', 'toast'], warn: ['console'] } });
// or without touching code, in this order of precedence: ?pk-log=debug in the URL, <html data-pk-log="debug">, the saved settings
// (configureLogging(..., { persist: true }), which the Settings page and the dev tools write) and localStorage['pk-log'].
// Whatever the level, the last few hundred entries are kept in a ring buffer (getLogBuffer()) and every entry goes to the sinks
// (addLogSink(fn)), which is how the logs viewer and PlainKit.Blazor's ILogger bridge see everything. Framework-free; never throws.
// From the browser console: PkLog.setLogLevel('debug').

export const LEVELS = Object.freeze(['debug', 'info', 'warn', 'error', 'silent']);
const RANK = Object.fromEntries(LEVELS.map((l, i) => [l, i]));
export const DEFAULT_LEVEL = 'warn';
export const BUFFER_SIZE = 300;
export const CONFIG_KEY = 'pk-log-config';
const EMITTING = ['debug', 'info', 'warn', 'error'];
export const DEFAULT_ROUTES = Object.freeze({ debug: ['console'], info: ['console'], warn: ['console'], error: ['console'] });
// Outputs that live in js/log-outputs.js and are imported the first time a route names them.
const LAZY_OUTPUTS = new Set(['toast', 'alert']);

// The level a page asks for, from its sources in precedence order (each may be missing or invalid). Pure.
export function levelFrom({ search = '', attr = null, stored = null } = {}) {
    let fromUrl = null;
    try { fromUrl = new URLSearchParams(search).get('pk-log'); } catch { /* not a query string */ }
    for (const candidate of [fromUrl, attr, stored]) if (candidate && LEVELS.includes(String(candidate).toLowerCase())) return String(candidate).toLowerCase();
    return DEFAULT_LEVEL;
}

const isLevel = v => typeof v === 'string' && LEVELS.includes(v);
const isName = v => typeof v === 'string' && /^[\w-]{1,40}$/.test(v);
const isScope = v => typeof v === 'string' && /^[\w:.-]{1,60}$/.test(v);

// Validates a settings object (from storage, an import or a form): only known levels, output names and scope names survive. Pure.
export function normalizeConfig(input) {
    const out = {};
    if (!input || typeof input !== 'object') return out;
    if (isLevel(input.level)) out.level = input.level;
    if (input.scopes && typeof input.scopes === 'object') {
        out.scopes = {};
        for (const [scope, level] of Object.entries(input.scopes)) if (isScope(scope) && isLevel(level) && scope !== '__proto__') out.scopes[scope] = level;
    }
    if (input.routes && typeof input.routes === 'object') {
        out.routes = {};
        for (const level of EMITTING) if (Array.isArray(input.routes[level])) out.routes[level] = [...new Set(input.routes[level].filter(isName))];
    }
    return out;
}

// Parses saved settings text (JSON); anything unreadable is "no settings". Pure.
export function parseConfig(text) {
    try { return normalizeConfig(JSON.parse(text)); } catch { return {}; }
}

function readSources() {
    const g = globalThis;
    let stored = null, saved = {};
    try { stored = g.localStorage?.getItem('pk-log') ?? null; } catch { /* storage blocked */ }
    try { saved = parseConfig(g.localStorage?.getItem(CONFIG_KEY) ?? ''); } catch { /* storage blocked */ }
    const level = levelFrom({ search: g.location?.search ?? '', attr: g.document?.documentElement?.getAttribute?.('data-pk-log') ?? null, stored: saved.level ?? stored });
    return { level, scopes: saved.scopes ?? {}, routes: { ...DEFAULT_ROUTES, ...(saved.routes ?? {}) } };
}

let config = readSources();
let buffer = [];
const sinks = new Set();
const outputs = new Map();
const pending = new Map(); // lazy output name -> entries waiting for its module

export const getLogLevel = () => config.level;
export function setLogLevel(level) {
    if (!isLevel(level)) return false;
    config = { ...config, level };
    return true;
}

// A copy of the current settings: { level, scopes: { scope: level }, routes: { level: [output names] } }.
export const getLoggingConfig = () => ({ level: config.level, scopes: { ...config.scopes }, routes: Object.fromEntries(Object.entries(config.routes).map(([k, v]) => [k, [...v]])) });

// Merges settings (invalid parts are ignored). With { persist: true } the result is saved in localStorage so it survives a reload.
// { replace: true } replaces scopes and routes instead of merging them. Returns the resulting settings.
export function configureLogging(partial, { persist = false, replace = false } = {}) {
    const n = normalizeConfig(partial);
    config = {
        level: n.level ?? config.level,
        scopes: n.scopes ? (replace ? n.scopes : { ...config.scopes, ...n.scopes }) : config.scopes,
        routes: n.routes ? { ...(replace ? DEFAULT_ROUTES : config.routes), ...n.routes } : config.routes,
    };
    if (persist) {
        try { globalThis.localStorage?.setItem(CONFIG_KEY, JSON.stringify({ level: config.level, scopes: config.scopes, routes: config.routes })); } catch { /* storage blocked */ }
    }
    for (const route of Object.values(config.routes)) for (const name of route) requireOutput(name);
    return getLoggingConfig();
}

// Forgets the saved settings and goes back to the defaults (the URL and page attribute still win for the level).
export function resetLogging() {
    try { globalThis.localStorage?.removeItem(CONFIG_KEY); } catch { /* storage blocked */ }
    config = { level: levelFrom({ search: globalThis.location?.search ?? '', attr: globalThis.document?.documentElement?.getAttribute?.('data-pk-log') ?? null }), scopes: {}, routes: { ...DEFAULT_ROUTES } };
    return getLoggingConfig();
}

export const getLogBuffer = () => buffer.slice();
export const clearLogBuffer = () => { buffer = []; };

// Receives every entry (regardless of the level): { at, level, scope, message, detail }. Returns a function that removes it.
export function addLogSink(fn) {
    sinks.add(fn);
    return () => sinks.delete(fn);
}

// Registers a named output that routes can name: fn(entry) is called for each emitted entry routed to it. Entries that were waiting for
// this output (a route named it before it existed) are delivered now. Returns a function that removes it.
export function registerLogOutput(name, fn) {
    if (!isName(name) || typeof fn !== 'function') return () => {};
    outputs.set(name, fn);
    for (const entry of pending.get(name) ?? []) deliver(name, fn, entry);
    pending.delete(name);
    return () => { if (outputs.get(name) === fn) outputs.delete(name); };
}

export const getLogOutputs = () => [...outputs.keys()];

function deliver(name, fn, entry) {
    try { fn(entry); } catch { /* a broken output must not break the SDK */ }
}

// Built-in outputs that live in another file are imported when a route first names them.
function requireOutput(name) {
    if (outputs.has(name) || !LAZY_OUTPUTS.has(name) || pending.has(name)) return;
    pending.set(name, []);
    import('./log-outputs.js').catch(() => { pending.delete(name); });
}

const consoleOutput = entry => {
    const c = globalThis.console?.[entry.level];
    if (!c) return;
    const text = `[pk:${entry.scope}] ${entry.message}`;
    if (entry.detail === undefined) c.call(globalThis.console, text); else c.call(globalThis.console, text, entry.detail);
};
outputs.set('console', consoleOutput);

const levelFor = scope => RANK[config.scopes[scope] ?? config.level];

// Records an entry, hands it to the sinks and, when its level is at or above the one for its scope, sends it to its routed outputs.
export function log(level, scope, message, detail) {
    if (!EMITTING.includes(level)) return null;
    const entry = { at: Date.now(), level, scope, message: String(message), ...(detail === undefined ? {} : { detail }) };
    buffer.push(entry);
    if (buffer.length > BUFFER_SIZE) buffer.shift();
    for (const sink of sinks) deliver('sink', sink, entry);
    if (RANK[level] >= levelFor(scope)) {
        for (const name of config.routes[level] ?? []) {
            const fn = outputs.get(name);
            if (fn) { deliver(name, fn, entry); continue; }
            requireOutput(name); // a built-in output that is not loaded yet: queue the entry until it registers
            pending.get(name)?.push(entry);
        }
    }
    return entry;
}

// A logger bound to a scope (the part of the SDK, or the app, that is speaking: 'loader', 'invokers', 'pk-dialog', 'checkout'...).
export function createLogger(scope) {
    return {
        scope,
        debug: (message, detail) => log('debug', scope, message, detail),
        info: (message, detail) => log('info', scope, message, detail),
        warn: (message, detail) => log('warn', scope, message, detail),
        error: (message, detail) => log('error', scope, message, detail),
    };
}

// A handle for the browser console, so a developer can turn the logs up on a live page: PkLog.setLogLevel('debug').
try {
    globalThis.PkLog ??= { createLogger, setLogLevel, getLogLevel, configureLogging, getLoggingConfig, resetLogging, getLogBuffer, clearLogBuffer, addLogSink, registerLogOutput, getLogOutputs };
} catch { /* a frozen global */ }
