// Undo and redo for a dock layout (#432, phase D3): a pure adapter over js/history.js. The history holds layout documents (the `doc` of js/dock-model.js);
// nothing here touches the DOM or a timer, and the caller passes the time (`at`). A drag or resize passes a `key` (resize:<splitId>, float:<id>) so one
// gesture is one undo step; a discrete operation (move, close, activate) passes none. Data coming back out goes through fromJson, the one door.
import { createHistory, record, undo, redo } from './history.js';
import { fromJson, panelIds, toJson } from './dock-model.js';

export const createDockHistory = doc => createHistory(doc);

/** Records the `{ doc, problems }` of a dock-model operation. An operation with problems, or one that changed nothing, leaves the history as it was. */
export function recordLayout(h, result, { key = null, at = 0 } = {}) {
    if (!result || result.problems?.length || !result.doc || toJson(result.doc) === toJson(h.present)) return h;
    return record(h, result.doc, { key, at });
}

// Steps once with `step` and re-validates the new present; if the stored layout does not survive fromJson cleanly the history stays unchanged.
function stepLayout(h, step) {
    const next = step(h);
    if (next === h) return { h, doc: h.present };
    const { doc, problems } = fromJson(next.present, { panels: [...panelIds(next.present), ...(next.present.floating ?? []).flatMap(x => x.group?.panels ?? [])].map(id => ({ id })) });
    return problems.length ? { h, doc: h.present } : { h: next, doc };
}

export const undoLayout = h => stepLayout(h, undo);
export const redoLayout = h => stepLayout(h, redo);
