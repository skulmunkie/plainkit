// Browser cases for pk-design-surface. Same contract as cases.js: [name, async (t) => void]. Every layout expectation is a rectangle comparison.
const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 20)));
const rect = e => e.getBoundingClientRect();
const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;
const inside = (inner, outer, tol = 1) => inner.left >= outer.left - tol && inner.top >= outer.top - tol && inner.right <= outer.right + tol && inner.bottom <= outer.bottom + tol;
const PAGE = '<div id="top" style="height:60px">Top</div><div id="mid" style="height:80px">Middle</div><div id="end" style="height:900px">Tall</div><div id="tail" style="height:60px">Tail</div>';
const SURFACE = (attrs = '', body = PAGE) => `<pk-design-surface label="Canvas" ${attrs}>${body}<span slot="chip" id="chip"><button type="button">Edit</button><button type="button">Delete</button></span><span slot="empty">Drop here</span></pk-design-surface>`;
const mount = async (t, attrs, body, dir = 'ltr') => {
    const host = await t.mount(`<div dir="${dir}">${SURFACE(attrs, body)}</div>`);
    const s = host.firstElementChild;
    s.style.blockSize = '24rem'; await t.settle();
    return s;
};
const mark = (s, kind) => [...s.shadowRoot.querySelectorAll(`[part="mark-${kind}"]`)];
const chipBox = s => rect(s.shadowRoot.querySelector('[part="chip"]'));
const ground = s => rect(s.shadowRoot.querySelector('.ground'));

export const designSurfaceCases = [
    ['design-surface: width frames cap the page at the token widths and centre it; full fills the ground', async t => {
        const s = await mount(t);
        const f = rect(s.part('frame')), full = rect(s.part('page'));
        t.ok(full.width > 300 && near(full.left - f.left, f.right - full.right, 40), 'full width fills the frame between its padding');
        for (const [w, px] of [['phone', 375], ['tablet', 768]]) {
            s.width = w; await t.settle();
            const p = rect(s.part('page')), avail = rect(s.part('frame')).width;
            t.ok(p.width <= px + 1 && (avail < px + 80 || near(p.width, px, 2)), `${w} page is ${px}px wide when there is room (${Math.round(p.width)} of ${Math.round(avail)})`);
            t.ok(near(p.left - rect(s.part('frame')).left, rect(s.part('frame')).right - p.right, 40), `${w} page is centred`);
        }
    }],

    ['design-surface: the selected mark is drawn on the node\'s rectangle, inside the ground, and follows the node when the ground scrolls', async t => {
        const s = await mount(t);
        const node = s.querySelector('#mid'); s.selected = node; await t.settle();
        const [m] = mark(s, 'selected');
        t.ok(m, 'a selection mark exists');
        const a = rect(m), n = rect(node);
        t.ok(near(a.left, n.left) && near(a.top, n.top) && near(a.width, n.width) && near(a.height, n.height), 'the mark has the node\'s rectangle');
        t.ok(inside(a, ground(s)), 'the mark is inside the ground');
        s.part('frame').scrollTop = 30; await frame();
        const m2 = rect(mark(s, 'selected')[0]), n2 = rect(node);
        t.ok(near(m2.top, n2.top) && near(n2.top, n.top - 30), 'the mark moved with the node after a scroll');
        s.selected = null; await t.settle();
        t.eq(mark(s, 'selected').length, 0, 'clearing selected removes the mark');
    }],

    ['design-surface: reveal scrolls a node that is out of view into the frame and its mark with it', async t => {
        const s = await mount(t);
        const node = s.querySelector('#tail'); s.selected = node; await t.settle();
        t.ok(rect(node).top > rect(s.part('frame')).bottom, 'the node starts below the frame');
        s.reveal(node); await t.settle();
        const f = rect(s.part('frame')), n = rect(node), m = rect(mark(s, 'selected')[0]);
        t.ok(n.top >= f.top && n.top < f.bottom, 'the node\'s top is now inside the frame');
        t.ok(near(m.top, n.top) && inside(m, ground(s)), 'the mark follows it inside the ground');
    }],

    ['design-surface: hidden and empty nodes are marked from their attributes, live, and the drop target gets its own box', async t => {
        const s = await mount(t);
        const a = s.querySelector('#top'), b = s.querySelector('#mid');
        a.setAttribute('data-surface-hidden', ''); b.setAttribute('data-surface-empty', ''); s.dropTarget = b; await t.settle();
        const h = rect(mark(s, 'hidden')[0]), e = rect(mark(s, 'empty')[0]), d = rect(mark(s, 'drop')[0]);
        t.ok(near(h.top, rect(a).top) && near(h.height, rect(a).height) && near(h.width, rect(a).width), 'the hidden veil covers its node');
        t.ok(near(e.top, rect(b).top) && near(e.height, rect(b).height), 'the empty frame covers its node');
        t.ok(near(d.top, rect(b).top) && near(d.width, rect(b).width), 'the drop box covers the target');
        a.removeAttribute('data-surface-hidden'); await t.settle();
        t.eq(mark(s, 'hidden').length, 0, 'removing the attribute removes the mark');
    }],

    ['design-surface: the chip sits above its node with the right edges aligned, inside the ground, and not over the node', async t => {
        const s = await mount(t);
        const node = s.querySelector('#mid'); s.chipFor = node; await t.settle();
        const c = chipBox(s), n = rect(node), g = ground(s);
        t.ok(c.width > 0 && inside(c, g), 'the chip is shown inside the ground');
        t.ok(near(c.right, n.right, 2) && c.bottom <= n.top + 1, 'the chip is above the node, right edge on its right edge');
    }],

    ['design-surface: a node at the top flips the chip inside its top edge, a narrow one below it, never over the top-left corner', async t => {
        const s = await mount(t);
        const node = s.querySelector('#top'); s.chipFor = node; await t.settle();
        const c = chipBox(s), n = rect(node);
        t.ok(c.top >= n.top && c.bottom <= n.bottom + 1 && inside(c, ground(s)), 'with no room above, the chip sits inside the node\'s top edge');
        t.ok(c.left > n.left, 'and does not cover the node\'s top-left corner');
        node.style.inlineSize = '40px'; await t.settle(); s.chipFor = null; s.chipFor = node; await t.settle();
        t.ok(chipBox(s).top >= rect(node).bottom - 1, 'a node narrower than the chip gets it below');
    }],

    ['design-surface: the chip is clamped at the right edge, hidden while dragging, when chipFor is null and when the node is out of view', async t => {
        const s = await mount(t);
        const node = s.querySelector('#mid'); node.style.inlineSize = '30px'; node.style.marginInlineStart = 'auto'; s.chipFor = node; await t.settle();
        t.ok(inside(chipBox(s), ground(s)), 'a narrow node at the right edge keeps the chip inside the ground');
        s.dragging = true; await t.settle();
        t.eq(chipBox(s).width, 0, 'no chip while dragging');
        s.dragging = false; await t.settle();
        t.ok(chipBox(s).width > 0, 'the chip is back after the drag');
        s.chipFor = s.querySelector('#tail'); s.part('frame').scrollTop = 0; await frame();
        t.eq(chipBox(s).width, 0, 'a node wholly out of view gets no chip');
        s.chipFor = null; await t.settle();
        t.eq(chipBox(s).width, 0, 'null hides the chip');
    }],

    ['design-surface: right-to-left keeps the chip on the node\'s right edge and the marks on the node', async t => {
        const s = await mount(t, 'width="phone"', PAGE, 'rtl');
        const node = s.querySelector('#mid'); s.selected = node; s.chipFor = node; await t.settle();
        const m = rect(mark(s, 'selected')[0]), n = rect(node), c = chipBox(s);
        t.ok(near(m.left, n.left) && near(m.width, n.width), 'the mark is on the node');
        t.ok(near(c.right, n.right, 2) && inside(c, ground(s)), 'the chip is on the right edge, inside the ground');
    }],

    ['design-surface: a click reports the deepest node under it (also on an inert page), shift makes it additive, bare ground reports null', async t => {
        const s = await mount(t, '', '<div id="outer" style="padding:10px"><p id="inner" style="margin:0;height:50px">Inner</p></div>');
        t.ok(s.part('page').inert, 'the page wrapper is inert by default');
        const seen = []; s.addEventListener('pk-surface-pick', e => seen.push(e.detail));
        const inner = rect(s.querySelector('#inner')), x = inner.left + 20, y = inner.top + 10;
        s.part('frame').dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, clientX: x, clientY: y }));
        s.part('frame').dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, shiftKey: true, clientX: inner.left + 5, clientY: rect(s.querySelector('#outer')).top + 3 }));
        const g = ground(s); s.part('frame').dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, clientX: g.right - 4, clientY: g.bottom - 4 }));
        t.eq(seen[0].target, s.querySelector('#inner'), 'the deepest node');
        t.eq(seen[1].target, s.querySelector('#outer'), 'the padding area belongs to the outer node');
        t.ok(seen[1].additive && !seen[0].additive, 'shift is additive');
        t.eq(seen[2].target, null, 'bare ground');
        s.interactive = true; await t.settle();
        t.ok(!s.part('page').inert, 'interactive lifts the inert page');
    }],

    ['design-surface: hover reports node changes once per frame and null on leave; keys are reported and a handled key is not scrolled', async t => {
        const s = await mount(t);
        const seen = []; s.addEventListener('pk-surface-hover', e => seen.push(e.detail.target));
        const f = s.part('frame'), n = rect(s.querySelector('#mid'));
        f.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: n.left + 5, clientY: n.top + 5 }));
        await new Promise(r => requestAnimationFrame(() => setTimeout(r, 30)));
        t.eq(seen[0], s.querySelector('#mid'), 'hover names the node');
        f.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false }));
        t.eq(seen.at(-1), null, 'leaving reports null');
        let key = null; s.addEventListener('pk-surface-key', e => { key = e.detail; e.preventDefault(); });
        const ev = new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true, composed: true, cancelable: true });
        f.dispatchEvent(ev);
        t.ok(key && key.key === 'ArrowDown' && key.shiftKey, 'the key detail is reported');
        t.ok(ev.defaultPrevented, 'a handled key stops the native scroll');
        const other = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, composed: true, cancelable: true });
        s.addEventListener('pk-surface-key', () => {}, { once: true });
        key = null; f.dispatchEvent(other);
        t.ok(key, 'every press is reported');
    }],

    ['design-surface: the empty slot shows only while the page is empty; the surface is a named, focusable group', async t => {
        const s = await mount(t, '', '');
        t.ok(!s.part('empty').hidden && rect(s.part('empty')).height > 0, 'the empty text shows on an empty page');
        s.append(Object.assign(document.createElement('p'), { textContent: 'Now there is content' })); await t.settle();
        t.ok(s.part('empty').hidden, 'and goes away with content');
        const f = s.part('frame');
        t.eq(f.getAttribute('role'), 'group'); t.eq(f.getAttribute('aria-label'), 'Canvas'); t.eq(f.tabIndex, 0);
    }],

    ['design-surface: nodeAt finds a page node slotted into a container, not the surface own chip, and the page keeps room below its last node', async t => {
        const s = await mount(t, '', '<pk-card id="card"><p id="inner">Body</p><div slot="footer" id="foot" style="height:40px">Footer</div></pk-card>');
        const foot = s.querySelector('#foot'), r = rect(foot);
        t.ok(r.height > 0, 'the slotted footer is laid out');
        t.eq(s.nodeAt(r.left + r.width / 2, r.top + r.height / 2), foot, 'nodeAt returns the node inside the [slot] container');
        t.ok(s.nodes().some(n => n.node === foot) && !s.nodes().some(n => n.node.id === 'chip'), 'nodes() lists it and not the chip');
        const page = rect(s.part('page')), last = rect(s.querySelector('#card'));
        t.ok(page.bottom - last.bottom >= 8, `the page panel ends below its last node (${Math.round(page.bottom - last.bottom)}px)`);
    }],
];
