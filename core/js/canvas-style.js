// The styles of pk-canvas' optional layers (#430), kept out of canvas.css: the page-level stylesheet is held to a size baseline, and a canvas without rulers or an adaptive grid
// should not carry their rules. A layer's sheet is built once and adopted into the host's shadow root the first time that layer is used. Tokens only, no literal colours.
import { breakpoint } from './breakpoints.js';

// The auto grid: a stronger line every major step, over the fine one canvas.css draws.
const grid = () => `
:host { --ds-line-major: var(--pk-canvas-grid-major, color-mix(in srgb, var(--color-text) 28%, transparent)); }
:host([auto-grid]) [part="frame"] {
    --ds-big: calc(var(--ds-major, 0) * var(--ds-zoom, 1) * 1px);
    background-image: linear-gradient(var(--ds-line-major) 1px, transparent 1px), linear-gradient(90deg, var(--ds-line-major) 1px, transparent 1px), linear-gradient(var(--ds-line) 1px, transparent 1px), linear-gradient(90deg, var(--ds-line) 1px, transparent 1px);
    background-size: var(--ds-big) var(--ds-big), var(--ds-big) var(--ds-big), var(--ds-cell) var(--ds-cell), var(--ds-cell) var(--ds-cell);
}`;

// The rulers: two strips along the top and left edge (physical sides: a drawing does not mirror), a corner with the unit and a pointer readout.
const rulers = () => `
:host { --ds-ruler: var(--pk-canvas-ruler-size, 1.5rem); }
[part="rulers"] { direction: ltr; position: absolute; inset: 0; pointer-events: none; font-size: var(--text-xs); color: var(--color-muted); font-variant-numeric: tabular-nums; }
[part="ruler"], [part="ruler-corner"], [part="ruler-readout"] { position: absolute; background-color: var(--color-bg); }
[part="ruler"] { overflow: hidden; background-image: linear-gradient(90deg, var(--ds-line-major) 1px, transparent 1px); background-size: var(--rk-tick, 10px) 25%; background-repeat: repeat-x; }
[part="ruler"][data-axis="x"] { top: 0; left: 0; right: 0; height: var(--ds-ruler); border-bottom: 1px solid var(--color-border); background-position: calc(var(--ds-x, 0) * 1px) 100%; }
[part="ruler"][data-axis="y"] { top: 0; left: 0; bottom: 0; width: var(--ds-ruler); border-right: 1px solid var(--color-border); background-image: linear-gradient(var(--ds-line-major) 1px, transparent 1px); background-size: 25% var(--rk-tick, 10px); background-repeat: repeat-y; background-position: 100% calc(var(--ds-y, 0) * 1px); }
[part="ruler"] > span { position: absolute; white-space: nowrap; padding: 0 var(--space-1); }
[part="ruler"][data-axis="x"] > span { top: 0; border-left: 1px solid var(--ds-line-major); }
[part="ruler"][data-axis="y"] > span { left: 0; writing-mode: vertical-rl; transform: rotate(180deg); border-top: 1px solid var(--ds-line-major); }
[part="ruler-corner"] { top: 0; left: 0; width: var(--ds-ruler); height: var(--ds-ruler); display: grid; place-items: center; border-right: 1px solid var(--color-border); border-bottom: 1px solid var(--color-border); box-sizing: border-box; }
[part="ruler-readout"] { bottom: 0; left: var(--ds-ruler); padding: 0 var(--space-1); background-color: color-mix(in srgb, var(--color-bg) 85%, transparent); }
[part="ruler-readout"]:empty { display: none; }
@media (max-width: ${breakpoint('phone')}px) { [part="rulers"] { display: none; } }`;

// The selection layer: a frame per selected item and the marquee. Outlines have a shape, so forced colours keep them.
const select = () => `
[part="selection"] { position: absolute; inset: 0; pointer-events: none; }
[part="selection"] > [data-sel] { position: absolute; box-sizing: border-box; outline: 2px solid var(--color-accent); outline-offset: 1px; }
[part="marquee"] { position: absolute; box-sizing: border-box; border: 1px dashed var(--color-accent); background: color-mix(in srgb, var(--color-accent) 14%, transparent); }
[part="selection"] > [part="handle"] { position: absolute; box-sizing: border-box; translate: -50% -50%; background: var(--color-bg); border: 2px solid var(--color-accent); pointer-events: auto; touch-action: none; }
[part="selection"] > [part="handle"]::before { content: ""; position: absolute; left: 50%; top: 50%; inline-size: var(--touch-target); block-size: var(--touch-target); translate: -50% -50%; }
[data-handle="nw"], [data-handle="se"] { cursor: nwse-resize; } [data-handle="ne"], [data-handle="sw"] { cursor: nesw-resize; } [data-handle="n"], [data-handle="s"] { cursor: ns-resize; } [data-handle="e"], [data-handle="w"] { cursor: ew-resize; }
[part="guide"], [part="snap-line"] { position: absolute; pointer-events: none; border-width: 0; border-style: solid; }
[part="guide"][data-axis="x"], [part="snap-line"][data-axis="x"] { top: 0; bottom: 0; inline-size: 0; border-left-width: 1px; }
[part="guide"][data-axis="y"], [part="snap-line"][data-axis="y"] { left: 0; right: 0; block-size: 0; border-top-width: 1px; }
[part="guide"] { border-style: dashed; }
@media (forced-colors: active) { [part="selection"] > [data-sel] { outline-color: Highlight; } [part="marquee"] { border-color: Highlight; } [part="handle"] { border-color: Highlight; } [part="guide"], [part="snap-line"] { border-color: Highlight; } }`;

const LAYERS = { grid, rulers, select };
const sheets = new Map();

// The auto grid has no behaviour of its own: mounting it adopts its sheet (the canvas calls draw and stop on every layer alike).
export const mount = host => { adopt(host, 'grid'); return { draw() {}, stop() {} }; };

// Adopt the sheet of `kind` ('grid' | 'rulers' | 'select') into the host's shadow root, once per host.
export function adopt(host, kind) {
    const used = (host.$cs ??= new Set());
    if (used.has(kind)) return;
    used.add(kind);
    if (!sheets.has(kind)) { const s = new CSSStyleSheet(); s.replaceSync(LAYERS[kind]()); sheets.set(kind, s); }
    host.shadowRoot.adoptedStyleSheets = [...host.shadowRoot.adoptedStyleSheets, sheets.get(kind)];
}
