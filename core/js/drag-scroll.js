// Auto-scroll while something is dragged, shared by pk-kanban and pk-sortable: the pointer within SCROLL_ZONE px of an edge scrolls that edge's scroller, up to
// SCROLL_MAX px a frame at the very edge (and past it). Pure rules (edgeSpeed) plus the DOM helpers every drag needs: a frame loop that stops cleanly, and the
// page-level vertical scroll (the nearest scrolling ancestor of the dragged list, else the window).
export const SCROLL_ZONE = 64, SCROLL_MAX = 18;

// The scroll step for one axis, in px: negative toward the start edge, positive toward the end edge, 0 in the middle. It grows with how deep the pointer is
// in the zone (a pointer past the edge counts as at the edge). reduced = prefers-reduced-motion: no ramp, a steady half speed, so it stays functional without easing.
export function edgeSpeed(pos, start, end, reduced = false, zone = SCROLL_ZONE, max = SCROLL_MAX) {
    const z = Math.min(zone, (end - start) / 2);
    if (!(z > 0)) return 0;
    const near = pos - start < z ? -(z - Math.max(pos - start, 0)) / z : end - pos < z ? (z - Math.max(end - pos, 0)) / z : 0;
    return reduced ? Math.sign(near) * max / 2 : near * max;
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// One animation-frame loop: step() runs every frame until stop(). start() while running does nothing; stop() leaves no callback pending.
export function frameLoop(step) {
    let id = 0, on = false;
    const tick = () => { id = 0; if (!on) return; step(); if (on) id = requestAnimationFrame(tick); };
    return {
        start() { if (on) return; on = true; id = requestAnimationFrame(tick); },
        stop() { on = false; if (id) cancelAnimationFrame(id); id = 0; },
    };
}

// The nearest ancestor of el (through shadow roots) that scrolls vertically, else the document's scroller.
export function scrollParent(el) {
    for (let n = el; n; n = n.parentElement ?? n.getRootNode?.().host) {
        if (n === document.body || n === document.documentElement) break;
        const oy = getComputedStyle(n).overflowY;
        if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n;
    }
    return document.scrollingElement;
}

// Scroll the page (the scroller from scrollParent) when y is near the top or bottom of what is visible of it. Returns the px actually scrolled (0 when
// nothing moved), so the caller can shift any viewport coordinates it cached.
export function scrollPageStep(el, y, reduced = reducedMotion()) {
    const s = scrollParent(el), doc = s === document.scrollingElement, r = doc ? null : s.getBoundingClientRect();
    const dy = edgeSpeed(y, doc ? 0 : Math.max(r.top, 0), doc ? innerHeight : Math.min(r.bottom, innerHeight), reduced);
    if (!dy) return 0;
    const was = s.scrollTop;
    s.scrollTop += dy;
    return s.scrollTop - was;
}
