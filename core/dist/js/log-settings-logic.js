// Pure logic behind the logging settings (modules/log-settings): turning the logging configuration into an editable draft (a global
// level, a level per scope, an output grid per level) and back into a configuration that js/log.js accepts, checking a scope name,
// and telling whether the URL or the page attribute is setting the level. No browser API is required, so node tests cover it.

import { LEVELS, DEFAULT_ROUTES, normalizeConfig } from './log.js';

export const EMITTING_LEVELS = Object.freeze(['debug', 'info', 'warn', 'error']);
export const BUILT_IN_OUTPUTS = Object.freeze(['console', 'toast', 'alert']);
// A scope row that sets no level of its own: it follows the global level.
export const INHERIT = 'inherit';

// The outputs a route can name: the built-in ones, then registered ones (getLogOutputs() also lists console) and any a saved route
// already names, each once.
export const outputsFor = (registered = [], routes = {}) => [...new Set([...BUILT_IN_OUTPUTS, ...registered, ...Object.values(routes).flat()])];

// The editable form of a configuration: { level, scopes: { scope: level | 'inherit' }, routes: { level: [output] } }. `seen` are scopes
// that have logged (they get a row even with no level of their own).
export function draftFrom(config, seen = []) {
    const scopes = {};
    for (const s of seen) scopes[s] = INHERIT;
    for (const [s, l] of Object.entries(config?.scopes ?? {})) scopes[s] = l;
    const routes = {};
    for (const l of EMITTING_LEVELS) routes[l] = [...(config?.routes?.[l] ?? DEFAULT_ROUTES[l])];
    return { level: LEVELS.includes(config?.level) ? config.level : 'warn', scopes, routes };
}

// The configuration a draft stands for, validated by normalizeConfig: 'inherit' rows are dropped, so only real overrides are saved.
export function configFrom(draft) {
    const scopes = {};
    for (const [s, l] of Object.entries(draft?.scopes ?? {})) if (l !== INHERIT) scopes[s] = l;
    return normalizeConfig({ level: draft?.level, scopes, routes: draft?.routes });
}

// Rows for the scope table, sorted, each { id, scope, level } (level 'inherit' when it follows the global level).
export const scopeRows = draft => Object.keys(draft.scopes).sort((a, b) => a.localeCompare(b)).map(scope => ({ id: scope, scope, level: draft.scopes[scope] }));

// Adds a scope by name. Returns { draft, error?, scope? }; the name is trimmed and checked the way js/log.js checks it.
export function addScope(draft, name) {
    const scope = String(name ?? '').trim();
    if (!scope) return { draft, error: 'Type a scope name, such as checkout.' };
    if (!normalizeConfig({ scopes: { [scope]: 'warn' } }).scopes?.[scope]) return { draft, error: 'A scope name is letters, digits, and : . _ - only (up to 60).' };
    if (scope in draft.scopes) return { draft, error: `${scope} is already listed.`, scope };
    return { draft: { ...draft, scopes: { ...draft.scopes, [scope]: INHERIT } }, scope };
}

export function removeScope(draft, scope) {
    const scopes = { ...draft.scopes };
    delete scopes[scope];
    return { ...draft, scopes };
}

export const setScopeLevel = (draft, scope, level) => (scope in draft.scopes && (level === INHERIT || LEVELS.includes(level)) ? { ...draft, scopes: { ...draft.scopes, [scope]: level } } : draft);
export const setGlobalLevel = (draft, level) => (LEVELS.includes(level) ? { ...draft, level } : draft);

// Sends `level` to `output` (on) or stops sending it there (off).
export function setRoute(draft, level, output, on) {
    if (!EMITTING_LEVELS.includes(level)) return draft;
    const now = draft.routes[level] ?? [];
    const next = on ? (now.includes(output) ? now : [...now, output]) : now.filter(o => o !== output);
    return { ...draft, routes: { ...draft.routes, [level]: next } };
}

// Rows for the routing grid: { id: level, level, <output>: boolean }.
export const routeRows = (draft, outputs) => EMITTING_LEVELS.map(level => ({ id: level, level, ...Object.fromEntries(outputs.map(o => [o, (draft.routes[level] ?? []).includes(o)])) }));

// Do two drafts stand for the same configuration?
export const sameDraft = (a, b) => JSON.stringify(configFrom(a)) === JSON.stringify(configFrom(b));

// Is something other than the saved settings choosing the level? ?pk-log= in the URL wins over <html data-pk-log>, which wins over the
// saved settings (js/log.js levelFrom). Returns { source: 'url' | 'attribute', level } or null.
export function levelOverride({ search = '', attr = null } = {}) {
    let fromUrl = null;
    try { fromUrl = new URLSearchParams(search).get('pk-log'); } catch { /* not a query string */ }
    const valid = v => (v && LEVELS.includes(String(v).toLowerCase()) ? String(v).toLowerCase() : null);
    if (valid(fromUrl)) return { source: 'url', level: valid(fromUrl) };
    if (valid(attr)) return { source: 'attribute', level: valid(attr) };
    return null;
}

export const describeOverride = o => (o ? (o.source === 'url' ? `?pk-log=${o.level} in the address` : `data-pk-log="${o.level}" on the page`) : '');

// The entries "Send a test" logs, one per level, under one scope.
export const TEST_SCOPE = 'settings-test';
export const testMessages = () => EMITTING_LEVELS.map(level => [level, `Test message at the ${level} level, from the logging settings`]);
