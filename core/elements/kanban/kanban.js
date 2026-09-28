// pk-kanban behaviour: a board of pk-kanban-column children, each holding pk-sortable-item cards (usually wrapping a pk-card). It reuses pk-sortable-item for the
// grab handle, pointer capture and the drop-indicator line, and adds the column logic: which column and index a pointer means, and Alt+arrow moves for the keyboard.
// Like pk-sortable it never moves, adds or removes a light-DOM child (STANDARDS.md, "Ownership and reactivity", rule 3): a move is reported as pk-move and the host
// applies it (re-renders, or moves the real nodes). The pure rules are exported for the Node tests.

// The insertion index a pointer position means, given the midpoints of a column's other cards, top to bottom.
export function dropIndex(mids, pos) {
    let i = 0;
    while (i < mids.length && pos > mids[i]) i++;
    return i;
}

// Which column the pointer is over: cols = [{ left, right, mids }] in board order. Outside every column it is the nearest one, so a drag never has no target.
// Returns { col, index }: the column's position in cols and the index the card would have there once lifted out.
export function dropTarget(cols, x, y) {
    if (!cols.length) return null;
    let best = 0, gap = Infinity;
    cols.forEach((c, i) => {
        const d = x < c.left ? c.left - x : x > c.right ? x - c.right : 0;
        if (d < gap) { gap = d; best = i; }
    });
    return { col: best, index: dropIndex(cols[best].mids, y) };
}

// Alt+arrow: the { col, index } a key asks for, or null. lens = each column's card count; Up/Down move within the column, Left/Right to the neighbouring
// column (mirrored when rtl), keeping the row where the target has one, else at its end. The index is where the card ends up.
export function keyDestination(key, col, index, lens, rtl = false) {
    if (key === 'ArrowUp') return index > 0 ? { col, index: index - 1 } : null;
    if (key === 'ArrowDown') return index < lens[col] - 1 ? { col, index: index + 1 } : null;
    const step = key === 'ArrowLeft' ? (rtl ? 1 : -1) : key === 'ArrowRight' ? (rtl ? -1 : 1) : 0;
    const to = col + step;
    if (!step || to < 0 || to >= lens.length) return null;
    return { col: to, index: Math.min(index, lens[to]) };
}

// The line for the live region: 1-based, so a screen reader hears "2 of 4".
export function announceMove(label, column, index, total) {
    return `${label} moved to ${column}, position ${index + 1} of ${total}.`;
}

// Auto-scroll while a card is dragged: the pointer within SCROLL_ZONE px of an edge of a scroller scrolls it, up to SCROLL_MAX px a frame at the very edge (and past it).
export const SCROLL_ZONE = 64, SCROLL_MAX = 18;

// The scroll step for one axis, in px: negative toward the start edge, positive toward the end edge, 0 in the middle. It grows with how deep the pointer is
// in the zone (a pointer past the edge counts as at the edge). reduced = prefers-reduced-motion: no ramp, a steady half speed, so it stays functional without easing.
export function edgeSpeed(pos, start, end, reduced = false, zone = SCROLL_ZONE, max = SCROLL_MAX) {
    const z = Math.min(zone, (end - start) / 2);
    if (!(z > 0)) return 0;
    const near = pos - start < z ? -(z - Math.max(pos - start, 0)) / z : end - pos < z ? (z - Math.max(end - pos, 0)) / z : 0;
    return reduced ? Math.sign(near) * max / 2 : near * max;
}

export default Base => class extends Base {
    connected() {
        if (this.$init) return;
        this.$init = true;
        this.watchSlot('', () => this.requestUpdate());
        this.addEventListener('pk-sortable-grab', e => { if (!this.disabled && !e.target.disabled && this.locate(e.target)) this.beginDrag(e.target); });
        this.addEventListener('pk-sortable-drag', e => { if (this.$drag && e.target === this.$drag.item) this.continueDrag(e.detail.x, e.detail.y); });
        this.addEventListener('pk-sortable-drop', e => { if (this.$drag && e.target === this.$drag.item) this.endDrag(Boolean(e.detail.cancelled)); });
        this.addEventListener('keydown', e => this.onKey(e));
    }
    // A drag in progress must not outlive the element: stop the frame loop and clear the drag marks.
    disconnected() { if (this.$drag) this.endDrag(true); this.stopScroll(); }
    get columns() { return Array.from(this.children).filter(c => c.localName === 'pk-kanban-column'); }
    cards(col) { return Array.from(col.children).filter(c => c.localName === 'pk-sortable-item'); }
    // The column and index a card is at now, or null when it is not a direct child of one of this board's columns.
    locate(card) {
        const cols = this.columns, col = cols.indexOf(card.parentElement);
        return col < 0 ? null : { col, index: this.cards(cols[col]).indexOf(card) };
    }
    say(text) { const p = this.part('announcer'); if (p) p.textContent = text; }
    name(col) { return col.label || col.value || 'column'; }

    // ---- pointer and touch, through the card's own handle
    beginDrag(card) {
        this.$drag = { item: card, from: this.locate(card), to: null };
        card.toggleAttribute('dragging', true);
        this.dragging = true;
        this.say(`Grabbed ${card.value || 'the card'}.`);
        this.$raf = requestAnimationFrame(() => this.scrollTick());
    }
    // ---- auto-scroll: one frame loop while a drag is active. The board scrolls sideways near its left or right edge, and the column under the pointer scrolls
    // up or down near its top or bottom; whatever moved, the drop target is worked out again because the columns and cards slid under a still pointer.
    scrollTick() {
        const d = this.$drag;
        this.$raf = 0;
        if (!d) return;
        if (d.x !== undefined) {
            const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches, board = this.part('board'), b = board.getBoundingClientRect();
            let moved = false;
            const dx = edgeSpeed(d.x, b.left, b.right, reduced);
            if (dx) { const was = board.scrollLeft; board.scrollLeft += dx; moved = board.scrollLeft !== was; }
            const col = this.columns[d.to ? d.to.col : 0], list = col?.part('list');
            if (list) {
                const r = list.getBoundingClientRect(), dy = edgeSpeed(d.y, r.top, r.bottom, reduced);
                if (dy) { const was = list.scrollTop; list.scrollTop += dy; moved = moved || list.scrollTop !== was; }
            }
            if (moved) this.continueDrag(d.x, d.y);
        }
        if (this.$drag) this.$raf = requestAnimationFrame(() => this.scrollTick());
    }
    stopScroll() { if (this.$raf) cancelAnimationFrame(this.$raf); this.$raf = 0; }
    continueDrag(x, y) {
        const d = this.$drag;
        d.x = x; d.y = y;
        // Read on every move: a column can scroll, and a card lifted out leaves a gap the others close over.
        const cols = this.columns.map(c => {
            const r = c.getBoundingClientRect();
            return { left: r.left, right: r.right, mids: this.cards(c).filter(k => k !== d.item).map(k => { const b = k.getBoundingClientRect(); return (b.top + b.bottom) / 2; }) };
        });
        const t = dropTarget(cols, x, y);
        if (!t || (d.to && d.to.col === t.col && d.to.index === t.index)) return;
        d.to = t;
        this.markAll(d.item, t);
    }
    // One drop-indicator line (before the neighbour after the gap, else after the last card) and one drop-target column.
    markAll(dragged, t) {
        this.columns.forEach((c, i) => {
            const others = this.cards(c).filter(k => k !== dragged), here = Boolean(t) && t.col === i;
            c.toggleAttribute('drop-target', here);
            others.forEach((k, j) => k.setAttribute('drop-indicator', here && j === t.index ? 'before' : here && t.index >= others.length && j === others.length - 1 ? 'after' : 'none'));
        });
    }
    endDrag(cancelled) {
        const d = this.$drag;
        this.$drag = null;
        this.stopScroll();
        d.item.toggleAttribute('dragging', false);
        this.dragging = false;
        this.markAll(d.item, null);
        if (cancelled || !d.to || (d.to.col === d.from.col && d.to.index === d.from.index)) { this.say('Move cancelled.'); return; }
        this.commit(d.item, d.from, d.to);
    }

    // ---- keyboard: arrows move focus between cards and columns, Alt+arrows move the focused card
    onKey(e) {
        if (this.disabled) return;
        if (e.key === 'Escape' && this.$drag) { this.endDrag(true); return; }
        const card = e.target.closest?.('pk-sortable-item');
        const at = card && this.locate(card);
        if (!at || card.disabled) return;
        const cols = this.columns, rtl = getComputedStyle(this).direction === 'rtl';
        if (e.altKey && e.key.startsWith('Arrow')) {
            const to = keyDestination(e.key, at.col, at.index, cols.map(c => this.cards(c).length), rtl);
            e.preventDefault();
            if (to) this.commit(card, at, to);
            return;
        }
        if (e.altKey) return;
        let next = null;
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') next = this.cards(cols[at.col])[at.index + (e.key === 'ArrowDown' ? 1 : -1)];
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            const step = (e.key === 'ArrowLeft' ? -1 : 1) * (rtl ? -1 : 1);
            for (let c = at.col + step; !next && c >= 0 && c < cols.length; c += step) { const list = this.cards(cols[c]); next = list[Math.min(at.index, list.length - 1)]; }
        }
        if (!next) return;
        e.preventDefault();
        next.focus();
    }

    // Ask the host to apply a move; this element never applies it. A host that calls preventDefault declines it.
    commit(card, from, to) {
        const cols = this.columns, id = card.value || '';
        const detail = { item: id, from: cols[from.col].value || '', to: cols[to.col].value || '', fromIndex: from.index, toIndex: to.index };
        if (!this.emit('pk-move', detail)) { this.say(`Move of ${id || 'the card'} cancelled.`); return; }
        this.say(announceMove(id || 'Card', this.name(cols[to.col]), to.index, this.cards(cols[to.col]).length + (from.col === to.col ? 0 : 1)));
    }

    updated() {
        this.aria({ role: 'group', ariaLabel: this.label || null });
        const cards = this.columns.flatMap(c => this.cards(c));
        const current = cards.find(i => i.tabIndex === 0 && !i.disabled) ?? cards.find(i => !i.disabled) ?? cards[0];
        for (const it of cards) it.tabIndex = it === current ? 0 : -1;
    }
};
