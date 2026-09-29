// Shared numeric-size helper used by pk-splitter and the dock-tree model. Lives under core/js/ (not an element folder) so nothing under
// core/js/ imports across into core/elements/<name>/ — the bootstrap flattens elements to dist/elements/<name>.js, so a core/js/ file
// that imported '../elements/<name>/<name>.js' would 404 once built (issue #601).

// A size held to the range (either order of min and max), to one decimal; a size that is not a number is the middle.
export const clampSize = (v, min, max) => {
    const lo = Math.min(min, max), hi = Math.max(min, max);
    return Math.round(Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : (lo + hi) / 2)) * 10) / 10;
};
