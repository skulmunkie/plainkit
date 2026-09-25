// Plainkit positioning: the one small module that places a floating layer (tooltip, popover, menu, palette flyout) next to an
// anchor, flips it to the opposite side when it would leave the viewport, and shifts it along the other axis to stay inside.
// Framework-free; no imports. The layer is position:fixed, so no overflow ancestor can clip it.
//
//   place(anchor, floating, { placement: 'bottom-start', offset: 4, padding: 8 })
//     anchor    an element, or a point/rect { x, y, width?, height? } (a context menu passes the pointer)
//     placement top | bottom | left | right, each optionally -start or -end (default centred)
//   Sets left/top from the CSSOM and data-placement (the side actually used) on the floating element.
//   autoUpdate(anchor, floating, options) re-places on scroll and resize and returns a stop function.
//   onOutside(elements, close) closes on a pointerdown outside all of them or on Escape; returns a stop function.

const OPPOSITE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

// Pure geometry. anchor: { left, top, right, bottom }, size: { width, height }, viewport: { width, height }.
// Returns { x, y, side } in viewport coordinates.
export function computePosition(anchor, size, viewport, options = {}) {
    const { placement = 'bottom', offset = 4, padding = 8, flip = true, shift = true } = options;
    const [wanted, align = 'center'] = placement.split('-');
    const aw = anchor.right - anchor.left;
    const ah = anchor.bottom - anchor.top;
    const at = side => {
        if (side === 'top' || side === 'bottom') {
            const x = align === 'start' ? anchor.left : align === 'end' ? anchor.right - size.width : anchor.left + aw / 2 - size.width / 2;
            return { x, y: side === 'top' ? anchor.top - size.height - offset : anchor.bottom + offset };
        }
        const y = align === 'start' ? anchor.top : align === 'end' ? anchor.bottom - size.height : anchor.top + ah / 2 - size.height / 2;
        return { x: side === 'left' ? anchor.left - size.width - offset : anchor.right + offset, y };
    };
    const over = (side, p) => (side === 'top' || side === 'bottom'
        ? Math.max(0, padding - p.y) + Math.max(0, p.y + size.height - (viewport.height - padding))
        : Math.max(0, padding - p.x) + Math.max(0, p.x + size.width - (viewport.width - padding)));
    const first = at(wanted);
    const alt = at(OPPOSITE[wanted]);
    const flipped = flip && over(wanted, first) > 0 && over(OPPOSITE[wanted], alt) < over(wanted, first);
    const side = flipped ? OPPOSITE[wanted] : wanted;
    const placed = flipped ? alt : first;
    if (shift) {
        const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, Math.max(lo, hi)));
        const across = side === 'top' || side === 'bottom';
        return { x: across ? clamp(placed.x, padding, viewport.width - size.width - padding) : placed.x, y: across ? placed.y : clamp(placed.y, padding, viewport.height - size.height - padding), side };
    }
    return { x: placed.x, y: placed.y, side };
}

// A node with display: contents (a slot wrapper) has no box and reports 0,0,0,0: use the union of its descendants' boxes.
export const boxOf = el => {
    const r = el.getBoundingClientRect();
    if (r.width || r.height || !el.children?.length) return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    const boxes = Array.from(el.children, boxOf).filter(b => b.right > b.left || b.bottom > b.top);
    if (!boxes.length) return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    return { left: Math.min(...boxes.map(b => b.left)), top: Math.min(...boxes.map(b => b.top)), right: Math.max(...boxes.map(b => b.right)), bottom: Math.max(...boxes.map(b => b.bottom)) };
};
const rectOf = anchor => {
    if (typeof anchor.getBoundingClientRect === 'function') return boxOf(anchor);
    return { left: anchor.x, top: anchor.y, right: anchor.x + (anchor.width ?? 0), bottom: anchor.y + (anchor.height ?? 0) };
};

export function place(anchor, floating, options = {}) {
    const style = floating.style;
    style.position = 'fixed'; style.left = '0px'; style.top = '0px';
    const box = floating.getBoundingClientRect();
    const view = { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight };
    const r = computePosition(rectOf(anchor), { width: box.width, height: box.height }, view, options);
    style.left = `${Math.round(r.x)}px`; style.top = `${Math.round(r.y)}px`;
    floating.setAttribute('data-placement', r.side);
    return r;
}

export function autoUpdate(anchor, floating, options = {}) {
    const st = { frame: 0 };
    const run = () => { st.frame = 0; place(anchor, floating, options); };
    const queue = () => { if (!st.frame) st.frame = requestAnimationFrame(run); };
    window.addEventListener('scroll', queue, true);
    window.addEventListener('resize', queue);
    return () => { window.removeEventListener('scroll', queue, true); window.removeEventListener('resize', queue); if (st.frame) cancelAnimationFrame(st.frame); };
}

// Whether a target lies inside any of the layers.
export function isInside(target, elements) { return elements.some(el => el && el.contains(target)); }

export function onOutside(elements, close) {
    const down = e => { if (!isInside(e.target, elements)) close(e); };
    const key = e => { if (e.key === 'Escape') close(e); };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', down, true); document.removeEventListener('keydown', key); };
}

// Clears what place() set, so a layer that a stylesheet positions (a static menu inside a folded navbar) is not left fixed.
export function unplace(floating) {
    const s = floating.style;
    s.position = ''; s.left = ''; s.top = '';
    floating.removeAttribute('data-placement');
}
