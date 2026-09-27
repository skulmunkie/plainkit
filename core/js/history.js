// A generic, coalesced, capped undo/redo stack. Pure: no DOM, no timers (the caller passes the time), and it works on any opaque `present` value
// (structured state for a form, a document, a canvas) - not just Plainkit's own theme overrides.
//
//   let h = createHistory(value);
//   h = record(h, next, { key: 'title', at: Date.now() });   // consecutive edits with the same key inside COALESCE_MS are one step
//   h = undo(h); h = redo(h); h.present;                       // the value now
//   canUndo(h); canRedo(h);

export const MAX_STEPS = 100;
export const COALESCE_MS = 800;

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export const createHistory = present => ({ past: [], present, future: [], key: null, at: 0 });

export const canUndo = h => h.past.length > 0;
export const canRedo = h => h.future.length > 0;

// Records `next` as the new present. The same value again is not a step. Repeated edits sharing one `key` inside `COALESCE_MS` are one step (typing
// in one field is one undo step, not one per keystroke).
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
