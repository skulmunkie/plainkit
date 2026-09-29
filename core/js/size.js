// Shared numeric-size helpers used by pk-splitter, the dock-tree model, and the gallery's own inspector-width drag handle (#391: reused
// here instead of duplicated, since core/site/gallery/gallery.js cannot import an element folder directly — see the dogfood test). Lives
// under core/js/ (not an element folder) so nothing under core/js/ imports across into core/elements/<name>/ — the bootstrap flattens
// elements to dist/elements/<name>.js, so a core/js/ file that imported '../elements/<name>/<name>.js' would 404 once built (issue #601).

// A size held to the range (either order of min and max), to one decimal; a size that is not a number is the middle.
export const clampSize = (v, min, max) => {
    const lo = Math.min(min, max), hi = Math.max(min, max);
    return Math.round(Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : (lo + hi) / 2)) * 10) / 10;
};

// The size a key asks for, or null when the key does nothing here. Side by side (horizontal): Left and Right, mirrored in a right-to-left page; stacked: Up and Down.
export function keySize(key, size, { min, max, step, horizontal, rtl = false }) {
    if (key === 'Home') return Math.min(min, max);
    if (key === 'End') return Math.max(min, max);
    const sign = horizontal ? { ArrowLeft: rtl ? 1 : -1, ArrowRight: rtl ? -1 : 1 }[key] : { ArrowUp: -1, ArrowDown: 1 }[key];
    return sign === undefined ? null : size + sign * (step > 0 ? step : 1);
}

// The size a pointer position means: pos on the axis, the pointer's offset from the handle's centre when it grabbed it, and the box (start, length) and the handle's thickness.
// unit 'percent' (default) returns a percentage of the box, as pk-splitter itself uses; unit 'px' returns the raw distance instead, for a caller that wants a host width in
// pixels rather than a percentage split of two panes (see the gallery's inspector-width handle).
export function pointerSize(pos, grab, start, length, handle, rtl = false, unit = 'percent') {
    const at = rtl ? start + length - (pos - grab) : pos - grab - start;
    const raw = at - handle / 2;
    return unit === 'px' ? raw : (raw / Math.max(1, length - handle)) * 100;
}
