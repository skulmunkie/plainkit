// Viewport pan/zoom logic for the canvas work (#430 step 1), pure functions, no DOM: coordinate transforms and the invariant every zoom bug
// breaks (the world point under the pointer stays fixed while zooming). Groundwork for a future `pk-canvas` element and the SVG toolkit (#431);
// this step builds only the viewport, not grid, snapping, selection or an element - see docs/superpowers/specs/2026-09-28-canvas-design.md.
//
// A viewport is `{ x, y, zoom }`: the world point shown at the container's top-left, and the scale (screen px per world unit). Every function
// here returns a new viewport (or point); none read the DOM or mutate their arguments.

// World point -> screen point (px from the container's top-left).
export function toScreen({ x, y, zoom }, p) {
    return { x: (p.x - x) * zoom, y: (p.y - y) * zoom };
}

// Screen point -> world point. The exact inverse of toScreen for the same viewport.
export function toWorld({ x, y, zoom }, p) {
    return { x: p.x / zoom + x, y: p.y / zoom + y };
}

// Clamp a zoom value to [min, max]. Both default to "no limit" so callers can clamp just one side.
export function clampZoom(zoom, min = 0, max = Infinity) {
    if (max < min) [min, max] = [max, min];
    return Math.min(max, Math.max(min, zoom));
}

// Pan by a screen-space delta (px): the world point that was under a given screen point stays under it after an equal drag, i.e. this is what a
// pointer drag calls each move. Zoom is unchanged.
export function pan({ x, y, zoom }, dx, dy) {
    return { x: x - dx / zoom, y: y - dy / zoom, zoom };
}

// Zoom by `factor` (> 1 zooms in, < 1 zooms out) around a screen-space focal point (e.g. the pointer for a wheel/pinch zoom), clamped to
// [min, max]. The invariant: the world point under the focal point before the call is still under it after, unless clamping changed the
// effective factor, in which case the focal point stays exactly fixed for whatever zoom clamping allowed.
export function zoomAt(state, factor, focalX, focalY, { min = 0, max = Infinity } = {}) {
    const before = toWorld(state, { x: focalX, y: focalY });
    const zoom = clampZoom(state.zoom * factor, min, max);
    const next = { x: state.x, y: state.y, zoom };
    const after = toScreen(next, before);
    // Shift x/y so the focal point maps back to (focalX, focalY): solve toScreen(next, before) == (focalX, focalY) for x, y.
    return pan(next, focalX - after.x, focalY - after.y);
}

// pk-canvas keeps the pixel position of the world origin ({ x, y } = where (0, 0) sits); these convert to and from the form above.
export const toOrigin = ({ x, y, zoom }) => ({ x: -x * zoom, y: -y * zoom, zoom });
export const fromOrigin = ({ x, y, zoom }) => ({ x: -x / zoom, y: -y / zoom, zoom });

// The viewport that shows the world rect r ({ x, y, w, h }) centred in a w by h container with `pad` px around it, as large as the limits allow.
export function zoomToFit(r, w, h, pad = 0, { min = 0, max = Infinity } = {}) {
    const zoom = clampZoom(Math.min((w - 2 * pad) / r.w, (h - 2 * pad) / r.h), min, max);
    return { x: r.x + r.w / 2 - w / 2 / zoom, y: r.y + r.h / 2 - h / 2 / zoom, zoom };
}

// The viewport with the world point (wx, wy) in the middle of a w by h container, zoom unchanged.
export const centerOn = ({ zoom }, wx, wy, w, h) => ({ x: wx - w / 2 / zoom, y: wy - h / 2 / zoom, zoom });

// The 1-2-5 ladder of grid spacings (…, 0.5, 1, 2, 5, 10, 20, 50, …) in display units, for an on-screen scale of `scale` px per unit (zoom times px per unit).
// minor is the smallest step that is at least 8 px apart (so under 20 px), major the smallest step at least five times the minor; both in the same units.
export function gridSteps(scale) {
    const at = n => [1, 2, 5][((n % 3) + 3) % 3] * 10 ** Math.floor(n / 3);
    let n = Math.floor(3 * Math.log10(8 / scale)) - 1;
    while (at(n) * scale < 8) n++;
    const minor = at(n);
    while (at(n) < minor * 5) n++;
    return { minor, major: at(n) };
}
