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
    ['canvas: wheel="auto" leaves a plain wheel to the page until the frame has focus; Ctrl+wheel zooms around the pointer either way', async t => {
        const s = await mount(t), f = s.part('frame'), r = rect(f);
        const wheel = init => { const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: r.left + 100, clientY: r.top + 80, ...init }); f.dispatchEvent(e); return e; };
        t.eq(s.wheel, 'auto');
        t.ok(!wheel({ deltaY: 50 }).defaultPrevented, 'an unfocused canvas does not take the plain wheel (the page scrolls)'); t.eq(s.panY, 0);
        const before = s.pointToWorld(r.left + 100, r.top + 80), z = wheel({ deltaY: -40, ctrlKey: true });
        await t.settle();
        t.ok(z.defaultPrevented && s.zoom > 1, 'Ctrl+wheel zooms');
        const after = s.pointToWorld(r.left + 100, r.top + 80);
        t.ok(near(after.x, before.x, 1) && near(after.y, before.y, 1), 'the world point under the pointer stays put');
        f.focus(); await t.settle();
        const py = s.panY, e = wheel({ deltaY: 30 });
        t.ok(e.defaultPrevented && near(s.panY, py - 30, 0.5), 'with focus the plain wheel pans');
    }],

    ['canvas: wheel="pan", "zoom" and "page" take the plain wheel as named', async t => {
        for (const [mode, prevented] of [['pan', true], ['zoom', true], ['page', false]]) {
            const s = await mount(t, `wheel="${mode}"`), f = s.part('frame'), r = rect(f);
            const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -30, clientX: r.left + 50, clientY: r.top + 50 });
            f.dispatchEvent(e); await t.settle();
            t.eq(e.defaultPrevented, prevented, `${mode}: prevented`);
            if (mode === 'pan') t.eq(s.panY, 30); else if (mode === 'zoom') t.ok(s.zoom > 1, 'zoomed'); else t.eq(s.zoom, 1);
        }
    }],

    ['canvas: zoomToFit puts the content inside the frame with a margin, centred, and Home does the same by key', async t => {
        const s = await t.mount('<pk-canvas label="Plan" min-zoom="0.1" max-zoom="8"><div id="node">Plan</div></pk-canvas>'); await t.settle();
        const node = s.querySelector('#node'); node.style.height = '60px';
        s.zoomToFit(); await t.settle();
        const f = rect(s.part('frame')), n = rect(node);
        t.ok(n.left >= f.left && n.right <= f.right && n.top >= f.top && n.bottom <= f.bottom, 'the content is inside the frame');
        t.ok(near((n.left + n.right) / 2, (f.left + f.right) / 2, 1.5) && near((n.top + n.bottom) / 2, (f.top + f.bottom) / 2, 1.5), 'and centred');
        t.ok(near(Math.min(n.left - f.left, f.right - n.right, n.top - f.top, f.bottom - n.bottom), 16, 2) || s.zoom === 8, 'with the margin on the tight side');
        s.reset(); await t.settle();
        s.part('frame').dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true })); await t.settle();
        t.ok(s.zoom > 1, 'Home fits');
        t.ok(/^Zoom \d+ percent$/.test(s.part('status').textContent), `the zoom is announced (${s.part('status').textContent})`);
    }],

    ['canvas: centerOn and zoomTo keep the coordinate API consistent', async t => {
        const s = await mount(t), f = rect(s.part('frame'));
        s.centerOn(500, 300); await t.settle();
        const c = s.worldToPoint(500, 300);
        t.ok(near(c.x, f.left + f.width / 2, 1) && near(c.y, f.top + f.height / 2, 1), 'the point is in the middle');
        s.zoomTo(2); await t.settle();
        t.eq(s.zoom, 2);
        const c2 = s.worldToPoint(500, 300);
        t.ok(near(c2.x, c.x, 1) && near(c2.y, c.y, 1), 'zooming about the middle keeps it there');
    }],

    ['canvas: in a right-to-left page the arrow keys follow the reading direction and the world is not mirrored', async t => {
        const host = await t.mount('<div dir="rtl"><pk-canvas label="Artboard"><div id="node">Page</div></pk-canvas></div>'); await t.settle();
        const c = host.querySelector('pk-canvas') || host, f = c.part('frame');
        f.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true })); await t.settle();
        t.eq(c.panX, -40, 'ArrowLeft moves the view toward the end side, mirrored');
        const w = c.pointToWorld(rect(f).left, rect(f).top);
        t.ok(near(w.x, 40, 0.5), 'world x still grows to the right');
    }],

    ['canvas: in a right-to-left page the world and the marks sit where the view says (#1660): the origin is at the frame left, not mirrored', async t => {
        const host = await t.mount('<div dir="rtl"><pk-canvas label="Artboard" pan-x="30" pan-y="20"><div id="node" data-surface-selected style="width:50px;height:30px">Page</div></pk-canvas></div>'); await t.settle();
        const c = host.querySelector('pk-canvas') || host, f = rect(c.part('frame')), w = rect(c.part('world')), n = rect(c.querySelector('#node')), m = rect(c.part('overlay').firstElementChild);
        t.ok(near(w.left, f.left + 1 + 30, 2), `the world starts 30px from the frame's left edge, as the view says (${w.left - f.left})`);
        t.ok(near(m.left, n.left, 1) && near(m.width, n.width, 1), 'the mark hugs the node');
        const p = c.worldToPoint(0, 0);
        t.ok(near(p.x, f.left + 30, 1), 'worldToPoint agrees');
    }],

    ['canvas: auto-grid keeps the fine line gap between 8 and 20px across ten zoom steps, and snaps to the fine step', async t => {
        const s = await mount(t, 'auto-grid min-zoom="0.05" max-zoom="40"');
        for (let i = 0; i < 40 && getComputedStyle(s.part('frame')).backgroundSize.split(',').length < 4; i++) await wait(50); // the grid layer loads on first use
        for (let i = 0; i < 10; i++) {
            const cell = parseFloat(getComputedStyle(s.part('frame')).backgroundSize.split(',')[2]);
            t.ok(cell >= 8 - 0.01 && cell < 20, `zoom ${s.zoom.toFixed(2)}: gap ${cell}px`);
            s.zoomTo(s.zoom * (i < 5 ? 1.6 : 0.4)); await t.settle();
        }
        s.reset(); await t.settle();
        const f = rect(s.part('frame')), p = s.pointToWorld(f.left + 57, f.top + 61);
        t.ok(p.x % 10 === 0 && p.y % 10 === 0, `snapped to the 10 step at zoom 1 (${p.x},${p.y})`);
    }],

    ['canvas: rulers load on first use, label every major step in the unit and report the pointer; millimetres label millimetres', async t => {
        const s = await mount(t, 'rulers unit="mm" pan-x="40" pan-y="40"');
        for (let i = 0; i < 40 && !s.part('ruler').firstElementChild; i++) await wait(50);
        const rx = s.part('ruler'), ry = s.shadowRoot.querySelector('[data-axis=y]'), f = rect(s.part('frame'));
        t.ok(!s.part('rulers').hidden && rx.children.length >= 2 && ry.children.length >= 2, 'ticks are labelled on both rulers');
        t.eq(s.part('ruler-corner').textContent, 'mm');
        const px = 96 / 25.4, a = [...rx.children].find(x => x.textContent === '0');
        t.ok(a && near(rect(a).left, f.left + 40, 2), 'the 0 label sits at the world origin');
        const b = [...rx.children].find(x => x.textContent === '50');
        t.ok(b && near(rect(b).left - rect(a).left, 50 * px, 1.5), `50 mm is ${50 * px} px apart (${b && rect(b).left - rect(a).left})`);
        s.part('frame').dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: f.left + 40 + 10 * px, clientY: f.top + 40 + 20 * px }));
        t.eq(s.part('ruler-readout').textContent, '10, 20 mm', 'the readout is in the unit');
        s.rulers = false; await t.settle();
        t.ok(s.part('rulers').hidden, 'turning rulers off hides them');
    }],

    ['canvas: rulers do not mirror in a right-to-left page', async t => {
        const host = await t.mount('<div dir="rtl"><pk-canvas label="Artboard" rulers pan-x="40" pan-y="40"><div>Page</div></pk-canvas></div>'); await t.settle();
        const c = host.querySelector('pk-canvas') || host;
        for (let i = 0; i < 40 && !c.part('ruler').firstElementChild; i++) await wait(50);
        const f = rect(c.part('frame')), rx = rect(c.part('ruler')), ry = rect(c.shadowRoot.querySelector('[data-axis=y]')), zero = [...c.part('ruler').children].find(x => x.textContent === '0');
        t.ok(near(ry.left, f.left, 2) && near(rx.top, f.top, 2), 'the vertical ruler is on the left, the horizontal on the top');
        t.ok(zero && near(rect(zero).left, f.left + 40, 2), 'the origin label is 40px from the left');
    }],
];
