// <pk-design-surface>: a scrolling ground that frames a page being edited (full, tablet or phone width), draws the selection, drop-target,
// hidden and empty marks as overlay boxes from the nodes' rectangles (the nodes are descendants at any depth, which ::slotted() cannot reach),
// and places the host's action chip beside a node. The host owns the model: the surface only reads data-surface-hidden / data-surface-empty on
// the page's nodes, draws what the selected / dropTarget / chipFor properties name, and reports picks, hovers and keys. The page wrapper is
// inert by default, so hit-testing is geometric (deepestAt) rather than by event target. The rectangle maths is pure and exported for Node tests.
import { applyDynamic } from '../../js/dynamic.js';

// A rectangle { left, top, width, height } relative to an origin rectangle.
export const relRect = (r, o) => ({ left: r.left - o.left, top: r.top - o.top, width: r.width, height: r.height });

// Index of the deepest item { depth, rect } containing the point (a later item wins a tie), or -1.
export function deepestAt(items, x, y) {
    let best = -1;
    items.forEach((it, i) => {
        const r = it.rect;
        if (x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height && (best < 0 || it.depth >= items[best].depth)) best = i;
    });
    return best;
}

// Where the chip goes, all in the bounds' coordinates: its right edge on the node's, above the node, else inside its top edge, else below it
// when inside would cover the node's top-left corner; always clamped into the bounds. null when the node is wholly outside the bounds.
export function placeChip(node, chip, bounds, gap) {
    if (node.left + node.width < 0 || node.top + node.height < 0 || node.left > bounds.width || node.top > bounds.height) return null;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
    const left = clamp(node.left + node.width - chip.width, 0, bounds.width - chip.width);
    let top = node.top - chip.height - gap;
    if (top < 0) top = left >= node.left + gap ? node.top + gap : node.top + node.height + gap;
    return { left, top: clamp(top, 0, bounds.height - chip.height) };
}

// How far to scroll a view { top, bottom, left, right } so a node rect shows, with a margin: { dx, dy } (0 when already visible).
export function revealDelta(n, v, pad) {
    const axis = (a0, a1, v0, v1) => (a0 < v0 + pad ? a0 - v0 - pad : a1 > v1 - pad ? a1 - v1 + pad : 0);
    return { dx: axis(n.left, n.right, v.left, v.right), dy: axis(n.top, n.bottom, v.top, v.bottom) };
}

const depthOf = (n, root) => (n === root ? 0 : 1 + depthOf(n.parentElement, root));
const KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Delete', 'Escape']);

export default Base => class extends Base {
    connected() {
        if (!this.$init) {
            this.$init = true;
            const frame = this.part('frame');
            frame.addEventListener('scroll', () => this.layout());
            frame.addEventListener('click', e => this.onClick(e));
            frame.addEventListener('pointermove', e => this.onMove(e));
            frame.addEventListener('pointerleave', () => this.hover(null));
            frame.addEventListener('keydown', e => this.onKey(e));
            this.watchSlot('', () => this.layout());
        }
        this.$mo = new MutationObserver(() => this.layout());
        this.$mo.observe(this, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-surface-hidden', 'data-surface-empty'] });
        if (typeof ResizeObserver === 'function') {
            this.$ro = new ResizeObserver(() => this.layout());
            this.$ro.observe(this.part('frame')); this.$ro.observe(this.part('page'));
        }
    }
    disconnected() { this.$mo?.disconnect(); this.$ro?.disconnect(); cancelAnimationFrame(this.$raf); this.$raf = 0; }

    updated() {
        if (!this.label) this.warnOnce('label', 'has no label: the surface has no accessible name');
        this.part('page').inert = !this.interactive;
        this.layout();
    }

    // The page's nodes as { node, depth, rect } (rect in viewport pixels), in document order; slotted chip and empty content are not page nodes.
    nodes() {
        return [...this.querySelectorAll('*')].filter(n => !n.closest('[slot]')).map(node => {
            return { node, depth: depthOf(node, this), rect: node.getBoundingClientRect() };
        });
    }
    // The deepest page node under a viewport point, or null.
    nodeAt(x, y) { const list = this.nodes(), i = deepestAt(list, x, y); return i < 0 ? null : list[i].node; }
    // A node's box relative to the page box (scroll is included, both are measured now).
    rectOf(node) { return relRect(node.getBoundingClientRect(), this.part('page').getBoundingClientRect()); }
    // Scrolls the ground so the node shows, with a margin.
    reveal(node) {
        const f = this.part('frame'), { dx, dy } = revealDelta(node.getBoundingClientRect(), f.getBoundingClientRect(), 8);
        f.scrollBy(dx, dy);
        this.layout();
    }

    onClick(e) {
        this.emit('pk-surface-pick', { target: this.nodeAt(e.clientX, e.clientY), additive: e.shiftKey || e.ctrlKey || e.metaKey }, { cancelable: false });
    }
    onMove(e) {
        this.$pt = { x: e.clientX, y: e.clientY };
        this.$raf ||= requestAnimationFrame(() => { this.$raf = 0; this.hover(this.nodeAt(this.$pt.x, this.$pt.y)); });
    }
    hover(target) {
        if (target === this.$hover) return;
        this.$hover = target;
        this.emit('pk-surface-hover', { target }, { cancelable: false });
    }
    // Arrows, Delete and Escape on the focused surface go to the host; a host that handles one calls preventDefault, which also stops the native scroll.
    onKey(e) {
        if (e.target !== this.part('frame') || !KEYS.has(e.key)) return;
        if (!this.emit('pk-surface-key', { key: e.key, shiftKey: e.shiftKey, altKey: e.altKey, ctrlKey: e.ctrlKey })) e.preventDefault();
    }

    // Redraws the empty slot, the marks and the chip from the current rectangles.
    layout() {
        if (!this.$init) return;
        const overlay = this.part('overlay'), proto = this.shadowRoot.querySelector('template'), o = overlay.getBoundingClientRect(), box = (kind, node) => {
            const b = relRect(node.getBoundingClientRect(), o), d = proto.content.querySelector(`[part=mark-${kind}]`).cloneNode();
            d.dataset.dyn = `left:${b.left}px; top:${b.top}px; width:${b.width}px; height:${b.height}px`;
            return d;
        };
        const slot = this.shadowRoot.querySelector('slot:not([name])');
        this.part('empty').hidden = slot.assignedNodes().some(n => n.nodeType === 1 || n.textContent.trim());
        const marks = [...this.querySelectorAll('[data-surface-hidden]')].map(n => box('hidden', n));
        marks.push(...[...this.querySelectorAll('[data-surface-empty]')].map(n => box('empty', n)));
        if (this.dropTarget && this.contains(this.dropTarget)) marks.push(box('drop', this.dropTarget));
        if (this.selected && this.contains(this.selected)) marks.push(box('selected', this.selected));
        overlay.replaceChildren(...marks);
        applyDynamic(overlay);
        this.placeChip(o);
    }
    placeChip(o) {
        const chip = this.part('chip'), node = this.chipFor;
        chip.hidden = !node || !this.contains(node) || this.dragging;
        if (chip.hidden) return;
        const at = placeChip(relRect(node.getBoundingClientRect(), o), chip.getBoundingClientRect(), { width: o.width, height: o.height }, 4);
        chip.hidden = !at;
        if (at) { chip.dataset.dyn = `left:${at.left}px; top:${at.top}px`; applyDynamic(chip); }
    }
};
