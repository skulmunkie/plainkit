// The theme editor's change list on top of the generic undo/redo stack (js/history.js): which tokens differ from the stylesheet, grouped, and
// clearing a token or a whole group. Pure: no DOM, no timers.
//
//   let h = createHistory(overrides);
//   h = record(h, next, { key: '--color-accent', at: Date.now() });   // consecutive edits to one key within COALESCE_MS are one step
//   h = undo(h); h = redo(h); h.present;                                // the overrides now
//   diffOverrides(overrides, tokens);   // [{ scope, group, name, from, to }]: what differs from the stylesheet, sorted by group then name
//   withoutGroup(overrides, 'color');   // a copy with every token of that group cleared

import { baseValue, overrideCount } from './theme-editor-logic.js';
import { createHistory, record, undo, redo, canUndo, canRedo, MAX_STEPS, COALESCE_MS } from './history.js';

export { createHistory, record, undo, redo, canUndo, canRedo, MAX_STEPS, COALESCE_MS };

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
