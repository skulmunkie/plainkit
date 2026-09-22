// The theme editor's undo/redo and change list (modules/theme-editor). Pure: no DOM, no timers (the caller passes the time).
//
//   let h = createHistory(overrides);
//   h = record(h, next, { key: '--color-accent', at: Date.now() });   // consecutive edits to one key within COALESCE_MS are one step
//   h = undo(h); h = redo(h); h.present;                                // the overrides now
//   diffOverrides(overrides, tokens);   // [{ scope, group, name, from, to }]: what differs from the stylesheet, sorted by group then name
//   withoutGroup(overrides, 'color');   // a copy with every token of that group cleared

import { baseValue, overrideCount } from './theme-editor-logic.js';

export const MAX_STEPS = 100;
export const COALESCE_MS = 800;

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export const createHistory = present => ({ past: [], present, future: [], key: null, at: 0 });

export const canUndo = h => h.past.length > 0;
export const canRedo = h => h.future.length > 0;

// Records `next` as the new present. The same overrides again is not a step. Typing in one field is many edits of one key: they are one step.
export function record(h, next, { key = null, at = 0 } = {}) {
    if (same(h.present, next)) return h;
    const merge = key !== null && key === h.key && at - h.at < COALESCE_MS && h.past.length > 0;
    const past = merge ? h.past : [...h.past, h.present].slice(-MAX_STEPS);
    return { past, present: next, future: [], key, at };
}

export function undo(h) {
    if (!h.past.length) return h;
    return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future], key: null, at: 0 };
}

export function redo(h) {
    if (!h.future.length) return h;
    return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), key: null, at: 0 };
}

// The group of a token: the word after the leading dashes (--color-accent is 'color', --pad-card is 'pad').
export const tokenGroup = name => name.split('-')[2] ?? 'other';

// Every edit that differs from the stylesheet, as { scope, group, name, from, to }. scope is 'shared' (both themes), 'dark' or 'light'; from is the
// stylesheet's value for that theme (the dark one for a shared edit).
export function diffOverrides(overrides, tokens) {
    const out = [];
    for (const scope of ['shared', 'dark', 'light']) for (const [name, to] of Object.entries(overrides[scope])) out.push({ scope, group: tokenGroup(name), name, from: baseValue(tokens, scope === 'shared' ? 'dark' : scope, name), to });
    const order = { shared: 0, dark: 1, light: 2 };
    return out.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name) || order[a.scope] - order[b.scope]);
}

// The number of tokens that differ from the stylesheet, however many themes carry the edit.
export const changedTokens = overrides => new Set(['shared', 'dark', 'light'].flatMap(s => Object.keys(overrides[s]))).size;

export const changeSummary = overrides => {
    const n = changedTokens(overrides);
    return n === 0 ? 'No changes' : `${n} change${n === 1 ? '' : 's'}`;
};

// A copy with every token of a group cleared everywhere.
export function withoutGroup(overrides, group) {
    const keep = dict => Object.fromEntries(Object.entries(dict).filter(([name]) => tokenGroup(name) !== group));
    return { shared: keep(overrides.shared), dark: keep(overrides.dark), light: keep(overrides.light) };
}

// A copy with one entry cleared from one scope ('shared', 'dark' or 'light') and the other scopes left as they are.
export function withoutEntry(overrides, scope, name) {
    const next = { shared: { ...overrides.shared }, dark: { ...overrides.dark }, light: { ...overrides.light } };
    delete next[scope][name];
    return next;
}

export { overrideCount };
