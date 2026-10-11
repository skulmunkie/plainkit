// Browser cases for pk-canvas. Same contract as cases.js: [name, async (t) => void]. Pan and zoom are measured on the slotted content's rectangle.
const wait = ms => new Promise(r => setTimeout(r, ms));
const rect = e => e.getBoundingClientRect();
const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;
const SURFACE = (attrs = '') => `<pk-canvas label="Artboard" ${attrs}><div id="node" data-surface-selected>Page</div></pk-canvas>`;
const mount = async (t, attrs) => { const s = await t.mount(SURFACE(attrs)); await t.settle(); return s; };
const ptr = (target, type, id, x, y) => target.dispatchEvent(new PointerEvent(type, { pointerId: id, bubbles: true, button: 0, clientX: x, clientY: y }));
const drag = (s, from, to) => { const f = s.part('frame'); ptr(f, 'pointerdown', 1, ...from); ptr(f, 'pointermove', 1, ...to); ptr(f, 'pointerup', 1, ...to); };

export const canvasCases = [
    ['canvas: defaults; the content sits at the origin of the frame at actual size', async t => {
        const s = await mount(t);
        t.eq(s.zoom, 1); t.eq(s.panX, 0); t.eq(s.grid, 0);
        const f = rect(s.part('frame')), n = rect(s.querySelector('#node'));
        t.ok(near(n.left, f.left + 1, 2) && near(n.top, f.top + 1, 2), 'the node is at the frame origin');
        t.eq(s.part('frame').getAttribute('aria-label'), 'Artboard');
    }],

    ['canvas: dragging the ground moves the content by exactly the drag distance and reports the view', async t => {
        const s = await mount(t);
        const before = rect(s.querySelector('#node')), f = rect(s.part('frame')); let seen = null;
        s.addEventListener('pk-view-change', e => { seen = e.detail; });
        drag(s, [f.left + 200, f.top + 150], [f.left + 260, f.top + 190]); await t.settle();
        const after = rect(s.querySelector('#node'));
        t.ok(near(after.left - before.left, 60) && near(after.top - before.top, 40), `moved by 60,40 (got ${after.left - before.left},${after.top - before.top})`);
        t.eq(s.panX, 60); t.eq(s.panY, 40); t.ok(seen && seen.x === 60, 'pk-view-change carried the view');
    }],

    ['canvas: zoom scales the content, the coordinate API round-trips and the limits hold', async t => {
        const s = await mount(t, 'min-zoom="0.5" max-zoom="2"');
        const f = rect(s.part('frame')), w0 = rect(s.querySelector('#node')).width;
        s.part('frame').dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -69.3, clientX: f.left + 100, clientY: f.top + 100 })); await t.settle();
        t.ok(near(s.zoom, 2, 0.05), `Ctrl+wheel up doubles the zoom to the limit (${s.zoom})`);
        t.ok(near(rect(s.querySelector('#node')).width, w0 * s.zoom, 1.5), 'the content is drawn at that scale');
        const p = s.pointToWorld(f.left + 100, f.top + 100), back = s.worldToPoint(p.x, p.y);
        t.ok(near(back.x, f.left + 100, 0.5) && near(back.y, f.top + 100, 0.5), 'the coordinate API round-trips');
        s.part('in').click(); await t.settle();
        t.eq(s.zoom, 2, 'the button cannot pass maxZoom');
        t.ok(s.part('in').disabled, 'and is disabled there');
        s.part('reset').click(); await t.settle();
        t.eq(s.zoom, 1); t.eq(s.panX, 0);
    }],

    ['canvas: the grid is drawn at the spacing times the zoom and pointToWorld snaps to it', async t => {
        const s = await mount(t, 'grid="20" zoom="2"');
        const cs = getComputedStyle(s.part('frame'));
        t.eq(cs.backgroundSize.split(',')[0].trim(), '40px 40px', 'cells are 20 world units at zoom 2');
        const f = rect(s.part('frame')), p = s.pointToWorld(f.left + 57, f.top + 61);
        t.ok(p.x % 20 === 0 && p.y % 20 === 0, `snapped to the grid (${p.x},${p.y})`);
    }],

    ['canvas: a node flagged data-surface-selected is framed, the frame follows a pan, and a press without movement picks the node', async t => {
        const s = await mount(t);
        const mark = () => s.part('overlay').firstElementChild, node = () => rect(s.querySelector('#node'));
        t.ok(mark(), 'a mark is drawn');
        t.ok(near(rect(mark()).left, node().left) && near(rect(mark()).width, node().width), 'it hugs the node');
        const f = rect(s.part('frame')); drag(s, [f.left + 200, f.top + 150], [f.left + 230, f.top + 150]); await t.settle();
        t.ok(near(rect(mark()).left, node().left), 'and follows a pan');
        let pick = null; s.addEventListener('pk-canvas-pick', e => { pick = e.detail; });
        const n = node(), el = s.querySelector('#node');
        ptr(el, 'pointerdown', 2, n.left + 3, n.top + 3); ptr(el, 'pointerup', 2, n.left + 3, n.top + 3);
        t.ok(pick && pick.target === el, 'the pick names the node');
        el.removeAttribute('data-surface-selected'); await wait(50); await t.settle();
        t.ok(!mark(), 'removing the flag removes the mark');
    }],

    ['canvas: the keyboard pans, zooms and resets the focused surface', async t => {
        const s = await mount(t), f = s.part('frame'), key = k => f.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
        key('ArrowRight'); key('ArrowDown'); await t.settle();
        t.eq(s.panX, -40); t.eq(s.panY, -40);
        key('+'); await t.settle(); t.ok(s.zoom > 1, 'plus zooms in');
        key('0'); await t.settle(); t.eq(s.zoom, 1); t.eq(s.panX, 0);
    }],
];
