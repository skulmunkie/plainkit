// The rulers of pk-canvas (#430 phase C2), loaded the first time `rulers` is set. A strip along the top and the left of the frame with a tick every minor step
// (a CSS gradient, no element per tick) and a label at every major step, in the canvas's unit, plus a readout of the pointer in that unit. It reads the host's view
// (panX, panY, zoom, unit, ppu()) and draws only inside the host's shadow tree; the stored world numbers are never changed. Positions are physical (left, top):
// a drawing is geometry, not text, so it does not mirror in a right-to-left page.
import { gridSteps } from './viewport-logic.js';
import { adopt } from './canvas-style.js';

// The label text of a value: at most six significant digits, no trailing zeros.
export const label = v => String(+v.toPrecision(6));

// The major ticks that fall inside a strip `len` px long: [{ at: px, text }], for a view that puts the world origin `origin` px along it.
export function ticks(origin, len, zoom, ppu) {
    const { major } = gridSteps(zoom * ppu), gap = major * ppu * zoom, out = [];
    for (let k = Math.ceil(-origin / gap); k * gap + origin <= len; k++) out.push({ at: origin + k * gap, text: label(k * major) });
    return out;
}

export function mount(host) {
    adopt(host, 'grid'); adopt(host, 'rulers');
    const frame = host.part('frame'), box = host.part('rulers'), [rx, ry, corner, readout] = box.children;
    const fill = (ruler, list, prop) => ruler.replaceChildren(...list.map(t => { const s = document.createElement('span'); s.textContent = t.text; s.style.setProperty(prop, `${t.at}px`); return s; }));
    const say = e => {
        const r = frame.getBoundingClientRect(), p = host.ppu(), z = host.zoom;
        readout.textContent = `${label((e.clientX - r.left - host.panX) / z / p)}, ${label((e.clientY - r.top - host.panY) / z / p)}${host.unit === 'none' ? '' : ` ${host.unit}`}`;
    };
    const leave = () => { readout.textContent = ''; };
    frame.addEventListener('pointermove', say);
    frame.addEventListener('pointerleave', leave);
    return {
        draw() {
            const on = host.rulers; box.hidden = !on;
            if (!on) return;
            const p = host.ppu(), z = host.zoom, { minor } = gridSteps(z * p);
            box.style.setProperty('--rk-tick', `${minor * p * z}px`);
            fill(rx, ticks(host.panX, frame.clientWidth, z, p), 'left');
            fill(ry, ticks(host.panY, frame.clientHeight, z, p), 'top');
            corner.textContent = host.unit === 'none' ? '' : host.unit;
        },
        stop() { frame.removeEventListener('pointermove', say); frame.removeEventListener('pointerleave', leave); box.hidden = true; },
    };
}
