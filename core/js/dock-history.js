// Undo and redo for a dock layout (#432, D3): pure, no DOM or timer; the caller passes the time (`at`). A drag or resize passes a `key` so one gesture is one step.
import { fromJson, panelIds, toJson } from './dock-model.js';

const COALESCE_MS = 800;
const MAX_STEPS = 100;
const base = { key: null, at: 0 };

export const createDockHistory = present => ({ past: [], present, future: [], ...base });

/** Records the `{ doc, problems }` of a dock-model operation; one with problems, or no change, leaves the history as it was. */
export function recordLayout(h, result, { key = null, at = 0 } = {}) {
    if (!result || result.problems?.length || !result.doc || toJson(result.doc) === toJson(h.present)) return h;
    const merge = key !== null && key === h.key && at - h.at < COALESCE_MS && h.past.length > 0;
    return { past: merge ? h.past : [...h.past, h.present].slice(-MAX_STEPS), present: result.doc, future: [], key, at };
}

// Steps once, then re-validates through fromJson; a layout that does not survive leaves the history unchanged.
function step(h, next) {
    if (!next) return { h, doc: h.present };
    const p = next.present;
    const { doc, problems } = fromJson(p, { panels: [...panelIds(p), ...(p.floating ?? []).flatMap(x => x.group?.panels ?? [])].map(id => ({ id })) });
    return problems.length ? { h, doc: h.present } : { h: next, doc };
}

export const undoLayout = h => step(h, h.past.length && { past: h.past.slice(0, -1), present: h.past.at(-1), future: [h.present, ...h.future], ...base });
export const redoLayout = h => step(h, h.future.length && { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), ...base });
