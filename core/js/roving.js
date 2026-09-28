// Roving focus: the one place that turns an arrow / Home / End key into "which item next", shared by every list or grid that moves focus with the keyboard
// (pk-sortable, pk-property-grid, the inline-edit part of pk-table). Pure, no DOM: the caller lists its items, moves focus itself and calls preventDefault.
//   keyStep(key, { horizontal, rtl })  -> -1 | 1 (one item back / forward), 'start' | 'end' (Home / End), or 0 for any other key.
//     Vertical: ArrowUp = back, ArrowDown = forward. Horizontal: ArrowLeft / ArrowRight, swapped when `rtl`.
//   stepIndex(key, index, count, { horizontal, rtl, wrap }) -> the index to focus, null for an arrow key with nowhere to go (an edge, when not `wrap`), or
//     undefined when the key is not a navigation key (or there are no items). Clamps at the ends unless `wrap`; from index -1 (nothing focused) forward lands on 0.
//   navigable(items, extra) -> the items that can take focus: not `disabled`, not `hidden`, and (optionally) passing `extra`. Disabled and hidden items are skipped, never landed on.

export function keyStep(key, { horizontal = false, rtl = false } = {}) {
    if (key === 'Home') return 'start';
    if (key === 'End') return 'end';
    const back = horizontal ? (rtl ? 'ArrowRight' : 'ArrowLeft') : 'ArrowUp', fwd = horizontal ? (rtl ? 'ArrowLeft' : 'ArrowRight') : 'ArrowDown';
    return key === back ? -1 : key === fwd ? 1 : 0;
}

export function stepIndex(key, index, count, opts = {}) {
    const s = keyStep(key, opts);
    if (!s || count < 1) return undefined;
    if (s === 'start') return 0;
    if (s === 'end') return count - 1;
    const to = index + s;
    if (to >= 0 && to < count) return to;
    return opts.wrap ? (to + count) % count : null;
}

export function navigable(items, extra) {
    return items.filter(x => !x.disabled && !x.hidden && (!extra || extra(x)));
}
