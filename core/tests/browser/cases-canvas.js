// Browser cases for pk-canvas. Same contract as cases.js: [name, async (t) => void]. Pan and zoom are measured on the slotted content's rectangle.
const wait = ms => new Promise(r => setTimeout(r, ms));
const rect = e => e.getBoundingClientRect();
const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;
const SURFACE = (attrs = '') => `<pk-canvas label="Artboard" ${attrs}><div id="node" data-surface-selected>Page</div></pk-canvas>`;
const mount = async (t, attrs) => { const s = await t.mount(SURFACE(attrs)); await t.settle(); return s; };
const ptr = (target, type, id, x, y, mods = {}) => target.dispatchEvent(new PointerEvent(type, { pointerId: id, bubbles: true, button: 0, isPrimary: true, clientX: x, clientY: y, ...mods }));
const drag = (s, from, to) => { const f = s.part('frame'); ptr(f, 'pointerdown', 1, ...from); ptr(f, 'pointermove', 1, ...to); ptr(f, 'pointerup', 1, ...to); };

// A selectable canvas with two items declared through their SVG attributes: a at world (40,40) 100x60, b at (200,30) 80x40. Waits for the lazy layer to load.
const ITEMS = '<svg width="400" height="300"><rect data-id="a" x="40" y="40" width="100" height="60" fill="none" tabindex="0"></rect><rect data-id="b" x="200" y="30" width="80" height="40" fill="none" tabindex="0"></rect></svg>';
const selectable = async (t, attrs) => {
    const s = await t.mount(`<pk-canvas label="Plan" selectable ${attrs}>${ITEMS}</pk-canvas>`);
    for (let i = 0; i < 80 && !s.$L?.select; i++) await wait(50);
    await s.$L.select; await t.settle(); return s;
};
// A press and release with no movement (a click) on an element at client coordinates.
const click = (el, x, y, mods) => { ptr(el, 'pointerdown', 9, x, y, mods); ptr(el, 'pointerup', 9, x, y, mods); };

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

    ['canvas: zoomToFit puts the content inside the frame with a margin, centred above the toolbar, and Home does the same by key (#1661)', async t => {
        const s = await t.mount('<pk-canvas label="Plan" min-zoom="0.1" max-zoom="8"><div id="node">Plan</div></pk-canvas>'); await t.settle();
        const node = s.querySelector('#node'); node.style.height = '200px';
        s.zoomToFit(); await t.settle();
        const fr = rect(s.part('frame')), tb = rect(s.part('toolbar')), n = rect(node), f = { left: fr.left, right: fr.right, top: fr.top, bottom: tb.top };
        t.ok(n.left >= f.left && n.right <= f.right && n.top >= f.top && n.bottom <= f.bottom, 'the content is inside the frame and clear of the toolbar (bottom ' + n.bottom + ' vs toolbar top ' + tb.top + ')');
        t.ok(near((n.left + n.right) / 2, (f.left + f.right) / 2, 1.5) && near((n.top + n.bottom) / 2, (f.top + f.bottom) / 2, 1.5), 'and centred in the area above the toolbar');
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

    // Selection (#430 phase C3): items declare a world rect through their own SVG attributes (or data-*), the canvas draws the frames and reports ids.
    ['canvas: the selection layer is not loaded until selectable; then a click selects, Shift toggles, bare ground clears, and the frame is the declared rect in frame pixels', async t => {
        const plain = await mount(t); t.ok(!plain.$L?.select, 'a canvas that is not selectable loads no selection layer');
        const s = await selectable(t, 'pan-x="20" pan-y="10" zoom="2"');
        t.ok(s.$L.select, 'selectable loads it');
        const ids = []; s.addEventListener('pk-canvas-select', e => ids.push(e.detail.ids.join(',')));
        const a = s.querySelector('[data-id=a]'), b = s.querySelector('[data-id=b]'), f = rect(s.part('frame')), ra = () => rect(a);
        click(a, ra().left + 5, ra().top + 5); await t.settle();
        t.eq(s.selection.join(','), 'a'); t.eq(ids.at(-1), 'a');
        const box = () => s.part('selection').querySelector('[data-sel]');
        t.ok(box() && near(rect(box()).left, f.left + 20 + 40 * 2, 2) && near(rect(box()).width, 100 * 2, 1), 'the frame is x*zoom+pan from the left and w*zoom wide');
        click(b, rect(b).left + 5, rect(b).top + 5, { shiftKey: true }); await t.settle();
        t.eq(s.selection.join(','), 'a,b'); t.eq(s.part('selection').querySelectorAll('[data-sel]').length, 2, 'two frames');
        click(a, ra().left + 5, ra().top + 5, { shiftKey: true }); await t.settle();
        t.eq(s.selection.join(','), 'b', 'Shift on a selected item deselects it');
        click(s.part('frame'), f.left + 300, f.top + 300); await t.settle();
        t.eq(s.selection.length, 0, 'a click on bare ground clears'); t.eq(ids.at(-1), '');
        t.ok(/Selection cleared/.test(s.part('status').textContent), `announced (${s.part('status').textContent})`);
        s.selection = ['b']; await t.settle();
        t.eq(s.part('selection').querySelectorAll('[data-sel]').length, 1, 'setting selection from code draws the frame');
    }],

    ['canvas: a marquee drag on bare ground selects what it touches in world units, Shift adds; mode="pan" and touch pan instead', async t => {
        const s = await selectable(t, 'zoom="2" min-zoom="0.5"'), f = rect(s.part('frame')), fr = s.part('frame');
        // World rect (30,30)-(150,110) at zoom 2 is frame px (60,60)-(300,220): touches a (40,40,100x60) only.
        ptr(fr, 'pointerdown', 5, f.left + 60, f.top + 60); ptr(fr, 'pointermove', 5, f.left + 200, f.top + 150);
        t.ok(!s.part('marquee').hidden, 'the marquee shows during the drag'); t.ok(near(rect(s.part('marquee')).width, 140, 1), 'and follows the pointer');
        ptr(fr, 'pointermove', 5, f.left + 300, f.top + 220); ptr(fr, 'pointerup', 5, f.left + 300, f.top + 220); await t.settle();
        t.eq(s.selection.join(','), 'a'); t.eq(s.panX, 0, 'the view did not pan'); t.ok(s.part('marquee').hidden, 'the marquee is gone');
        ptr(fr, 'pointerdown', 6, f.left + 400, f.top + 60, { shiftKey: true }); ptr(fr, 'pointermove', 6, f.left + 560, f.top + 140, { shiftKey: true }); ptr(fr, 'pointerup', 6, f.left + 560, f.top + 140, { shiftKey: true }); await t.settle();
        t.eq(s.selection.join(','), 'a,b', 'Shift adds b (world 200..280 by 30..70)');
        const p = await selectable(t, 'mode="pan"'), pf = rect(p.part('frame'));
        drag(p, [pf.left + 300, pf.top + 200], [pf.left + 340, pf.top + 230]); await t.settle();
        t.eq(p.panX, 40, 'mode=pan drags the view'); t.eq(p.selection.length, 0);
        const th = await selectable(t, ''), tf = th.part('frame');
        tf.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, pointerType: 'touch', bubbles: true, button: 0, isPrimary: true, clientX: pf.left + 300, clientY: pf.top + 200 }));
        tf.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, pointerType: 'touch', bubbles: true, isPrimary: true, clientX: pf.left + 330, clientY: pf.top + 200 }));
        tf.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, pointerType: 'touch', bubbles: true, isPrimary: true, clientX: pf.left + 330, clientY: pf.top + 200 })); await t.settle();
        t.eq(th.panX, 30, 'one finger pans');
    }],

    ['canvas: Ctrl+A selects every item, the first Escape clears the selection, the second reaches pk-canvas-key; the change is announced', async t => {
        const s = await selectable(t, ''), fr = s.part('frame'), keys = [], key = (k, mods = {}) => fr.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods }));
        s.addEventListener('pk-canvas-key', e => keys.push(e.detail.key));
        key('a', { ctrlKey: true }); await t.settle();
        t.eq(s.selection.join(','), 'a,b'); t.eq(s.part('status').textContent, '2 items selected');
        key('Escape'); await t.settle(); t.eq(s.selection.length, 0); t.eq(keys.length, 0, 'the first Escape is the selection\'s');
        key('Escape'); t.eq(keys.join(','), 'Escape', 'the second reaches the page');
    }],

    ['canvas: keyboard focus on an item selects it (Tab through the items), and the canvas does not write to the items', async t => {
        const s = await selectable(t, ''), a = s.querySelector('[data-id=a]'), b = s.querySelector('[data-id=b]'), before = s.innerHTML;
        s.part('frame').focus(); s.part('frame').dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
        a.focus(); await t.settle(); t.eq(s.selection.join(','), 'a', `focus selects`);
        b.focus(); await t.settle(); t.eq(s.selection.join(','), 'b');
        t.eq(s.innerHTML, before, 'the light DOM is untouched');
    }],

    ['canvas: in a right-to-left page the selection frame is still at the declared position', async t => {
        const host = await t.mount('<div dir="rtl"><pk-canvas label="Plan" selectable selection=\'["a"]\' pan-x="20" pan-y="10"><svg width="300" height="150"><rect data-id="a" x="40" y="40" width="100" height="60"></rect></svg></pk-canvas></div>'); await t.settle();
        const s = host.querySelector('pk-canvas') || host;
        for (let i = 0; i < 40 && !s.part('selection').querySelector('[data-sel]'); i++) await wait(50);
        const f = rect(s.part('frame')), box = s.part('selection').querySelector('[data-sel]');
        t.ok(box && near(rect(box).left, f.left + 20 + 40, 1.5), `the frame is 60px from the left edge (${box && rect(box).left - f.left})`);
    }],

    ['canvas: with a selection the arrows move it through a cancelable pk-canvas-move (a grid step, Shift ten, Alt one screen pixel), the frame follows the written-back item; readonly or nothing selected pans (#430 C4)', async t => {
        const s = await selectable(t, 'grid="10" zoom="2"'), fr = s.part('frame'), got = [];
        const key = (k, mods = {}) => fr.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...mods }));
        s.addEventListener('pk-canvas-move', e => { got.push({ ...e.detail, cancelable: e.cancelable }); for (const m of e.detail.moves) { const el = s.querySelector(`[data-id="${m.id}"]`); el.setAttribute('x', m.x); el.setAttribute('y', m.y); } });
        s.selection = ['a']; await t.settle();
        key('ArrowRight'); await t.settle();
        t.eq(JSON.stringify(got.at(-1)), JSON.stringify({ moves: [{ id: 'a', x: 50, y: 40 }], done: true, cancelable: true }), 'one grid step right, cancelable');
        t.eq(s.panX, 0, 'the view did not pan');
        key('ArrowDown', { shiftKey: true }); await t.settle();
        t.eq(JSON.stringify(got.at(-1).moves), JSON.stringify([{ id: 'a', x: 50, y: 140 }]), 'Shift: ten steps');
        key('ArrowLeft', { altKey: true }); await t.settle();
        t.eq(got.at(-1).moves[0].x, 49.5, 'Alt: one screen pixel at zoom 2');
        t.ok(/Moved to 49\.5, 140/.test(s.part('status').textContent), `announced (${s.part('status').textContent})`);
        const f = rect(fr), box = s.part('selection').querySelector('[data-sel]');
        t.ok(box && near(rect(box).left, f.left + 49.5 * 2, 2) && near(rect(box).top, f.top + 140 * 2, 2), 'the frame follows the written-back position');
        s.readonly = true; await t.settle(); const n = got.length;
        key('ArrowRight'); await t.settle();
        t.eq(got.length, n, 'readonly: no move'); t.eq(s.panX, -40, 'readonly: the arrow pans');
        s.readonly = false; s.selection = []; await t.settle();
        key('ArrowRight'); await t.settle();
        t.eq(got.length, n, 'nothing selected: no move'); t.eq(s.panX, -80, 'nothing selected: the arrow pans');
    }],

    ['canvas: dragging a selected item streams pk-canvas-move in world units (done false) and ends with done true, without panning; an unselected item does not drag; Escape puts it back; readonly does not drag (#430 C4 drag)', async t => {
        const s = await selectable(t, 'zoom="2"'), fr = s.part('frame'), a = s.querySelector('[data-id=a]'), got = [];
        s.addEventListener('pk-canvas-move', e => got.push(e.detail));
        s.selection = ['a']; await t.settle();
        const r = rect(a), x0 = r.left + 10, y0 = r.top + 10;
        ptr(a, 'pointerdown', 4, x0, y0); ptr(fr, 'pointermove', 4, x0 + 20, y0 + 10); ptr(fr, 'pointermove', 4, x0 + 40, y0 + 20); ptr(fr, 'pointerup', 4, x0 + 40, y0 + 20); await t.settle();
        t.eq(JSON.stringify(got), JSON.stringify([{ moves: [{ id: 'a', x: 50, y: 45 }], done: false }, { moves: [{ id: 'a', x: 60, y: 50 }], done: false }, { moves: [{ id: 'a', x: 60, y: 50 }], done: true }]), 'pointer pixels / zoom, measured from the start each time');
        t.eq(s.panX, 0, 'the view did not pan'); t.eq(s.selection.join(','), 'a', 'the selection stays');
        t.ok(/Moved to 60, 50/.test(s.part('status').textContent), `the end is announced (${s.part('status').textContent})`);
        got.length = 0;
        const b = s.querySelector('[data-id=b]'), rb = rect(b);
        ptr(b, 'pointerdown', 5, rb.left + 5, rb.top + 5); ptr(fr, 'pointermove', 5, rb.left + 45, rb.top + 5); ptr(fr, 'pointerup', 5, rb.left + 45, rb.top + 5); await t.settle();
        t.eq(got.length, 0, 'an unselected item is not dragged'); t.eq(s.panX, 0);
        ptr(a, 'pointerdown', 6, x0, y0); ptr(fr, 'pointermove', 6, x0 + 40, y0);
        fr.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        ptr(fr, 'pointerup', 6, x0 + 40, y0); await t.settle();
        t.eq(JSON.stringify(got.map(g => [g.moves[0].x, g.done])), JSON.stringify([[60, false], [40, true]]), 'Escape puts it back where it started and ends the drag');
        t.eq(s.selection.join(','), 'a', 'that Escape did not clear the selection');
        got.length = 0; s.readonly = true; await t.settle();
        ptr(a, 'pointerdown', 7, x0, y0); ptr(fr, 'pointermove', 7, x0 + 40, y0); ptr(fr, 'pointerup', 7, x0 + 40, y0); await t.settle();
        t.eq(got.length, 0, 'readonly: no drag');
    }],

    ['canvas: 2000 declared items stay selectable (Ctrl+A) and a pan step stays cheap (timings reported)', async t => {
        const rects = Array.from({ length: 2000 }, (_, i) => `<rect data-id="i${i}" x="${(i % 50) * 30}" y="${Math.floor(i / 50) * 30}" width="24" height="24"></rect>`).join('');
        const s = await t.mount(`<pk-canvas label="Many" selectable min-zoom="0.05"><svg width="1500" height="1200">${rects}</svg></pk-canvas>`);
        for (let i = 0; i < 80 && !s.$L?.select; i++) await wait(50);
        await t.settle();
        const fr = s.part('frame'), t0 = performance.now();
        fr.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true })); await t.settle();
        const select = performance.now() - t0;
        t.eq(s.selection.length, 2000, 'all 2000 are selected');
        const t1 = performance.now(); for (let i = 0; i < 10; i++) { s.panX = i; await t.settle(); } const step = (performance.now() - t1) / 10;
        t.ok(select < 3000 && step < 400, `select all ${Math.round(select)} ms, a pan step ${Math.round(step)} ms (generous bounds; the numbers are the record)`);
    }],
];
