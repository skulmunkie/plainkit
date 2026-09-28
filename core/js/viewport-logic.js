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
