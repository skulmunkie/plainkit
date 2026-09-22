// pk-sortable behaviour: a pointer/touch/keyboard reorder list of pk-sortable-item children, and a drop target for an item dragged in from
// outside it (a palette). The pure rules are exported for the Node tests.
//
// Like every Plainkit element it never reorders, adds or removes the light-DOM children the host renders (STANDARDS.md, "Ownership and
// reactivity", rule 3): a drag only pushes dragging and dropIndicator onto the neighbours it passes, and pk-reorder carries the order the
// host should apply. The host owns doing that (re-rendering, or moving the real nodes); pk-sortable never touches DOM structure itself.
//
// External drops: a source outside this list (a palette button, say) calls beginExternalDrag(payload) on its own pointerdown, then
// externalDragOver(x, y) on pointermove and endExternalDrag(commit) on pointerup/pointercancel. Nothing here assumes HTML5 drag-and-drop,
// so the same three calls work for a touch drag too. accept-external must be set, or the drop is refused and logged.

// The new order when the item at `from` moves to `to`; a copy, unchanged when either index is out of range or nothing moves.
export function moveOrder(order, from, to) {
    if (from < 0 || from >= order.length || to < 0 || to >= order.length || from === to) return order.slice();
    const next = order.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
}

// Alt+ArrowUp / Alt+ArrowDown: the index the key asks for, or null for any other key or with nowhere to go.
export function keyMove(key, index, length) {
    if (key === 'ArrowUp') return index > 0 ? index - 1 : null;
    if (key === 'ArrowDown') return index < length - 1 ? index + 1 : null;
    return null;
}

// The insertion index a pointer position means, given the midpoints of the other rows along the drag axis, in their current order.
export function dropIndex(mids, pos) {
    let i = 0;
    while (i < mids.length && pos > mids[i]) i++;
    return i;
}

// A short line for the live region: a 1-based position, so a screen reader hears "3 of 5" rather than an index.
export function announceMove(label, index, total) {
    return `${label} moved to position ${index + 1} of ${total}.`;
}

const mid = (el, axis) => { const r = el.getBoundingClientRect(); return axis === 'y' ? (r.top + r.bottom) / 2 : (r.left + r.right) / 2; };

export default Base => class extends Base {
    connected() {
        if (this.$init) return;
        this.$init = true;
        this.watchSlot('', () => this.requestUpdate());
        this.addEventListener('pk-sortable-grab', e => { const it = e.target; if (it.parentElement === this && !this.disabled && !it.disabled) this.beginDrag(it, e.detail.x, e.detail.y); });
        this.addEventListener('pk-sortable-drag', e => { if (this.$drag && e.target === this.$drag.item) this.continueDrag(e.detail.x, e.detail.y); });
        this.addEventListener('pk-sortable-drop', e => { if (this.$drag && e.target === this.$drag.item) this.endDrag(Boolean(e.detail.cancelled)); });
        this.addEventListener('keydown', e => this.onKey(e));
    }
    get items() { return Array.from(this.children).filter(c => c.localName === 'pk-sortable-item'); }
    idOf(item) { return item.value || ''; }
    axis() { return this.orientation === 'horizontal' ? 'x' : 'y'; }
    say(text) { const p = this.part('announcer'); if (p) p.textContent = text; }
    mark(items) { for (const it of items) it.setAttribute('drop-indicator', 'none'); }

    // ---- reordering an existing row (pointer or touch, through the row's own handle)
    beginDrag(item, x, y) {
        const items = this.items, from = items.indexOf(item);
        if (from < 0) return;
        const others = items.filter(i => i !== item);
        this.$drag = { item, from, to: from, ids: items.map(i => this.idOf(i)), others, axis: this.axis(), mids: others.map(o => mid(o, this.axis())) };
        item.toggleAttribute('dragging', true);
        this.dragging = true;
        this.say(`Grabbed ${this.idOf(item) || 'the item'}.`);
    }
    continueDrag(x, y) {
        const d = this.$drag;
        if (!d) return;
        const to = dropIndex(d.mids, d.axis === 'y' ? y : x);
        if (to === d.to) return;
        d.to = to;
        this.mark(d.others);
        const before = d.others[to];
        if (before) before.setAttribute('drop-indicator', 'before');
        else d.others[d.others.length - 1]?.setAttribute('drop-indicator', 'after');
    }
    endDrag(cancelled) {
        const d = this.$drag;
        if (!d) return;
        d.item.toggleAttribute('dragging', false);
        this.dragging = false;
        this.mark(d.others);
        this.$drag = null;
        if (cancelled || d.to === d.from) { this.say('Reorder cancelled.'); return; }
        const order = moveOrder(d.ids, d.from, d.to);
        this.say(announceMove(this.idOf(d.item) || 'Item', d.to, d.ids.length));
        this.emit('pk-reorder', { order, item: d.ids[d.from], from: d.from, to: d.to, external: false }, { cancelable: false });
    }

    // ---- keyboard: plain arrows move focus (roving tabindex), Alt+Up/Alt+Down reorder the focused row
    onKey(e) {
        if (this.disabled) return;
        const items = this.items;
        const item = e.target.closest?.('pk-sortable-item');
        const i = items.indexOf(item);
        if (i < 0 || item.disabled) return;
        if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
            const to = keyMove(e.key, i, items.length);
            if (to === null) return;
            e.preventDefault();
            const ids = items.map(x => this.idOf(x));
            const order = moveOrder(ids, i, to);
            this.say(announceMove(this.idOf(item) || 'Item', to, ids.length));
            this.emit('pk-reorder', { order, item: ids[i], from: i, to, external: false }, { cancelable: false });
            return;
        }
        if (e.altKey) return;
        const nav = items.filter(x => !x.disabled), ni = nav.indexOf(item); // a disabled row is skipped, never landed on
        const to = { ArrowDown: ni + 1 < nav.length ? ni + 1 : null, ArrowUp: ni > 0 ? ni - 1 : null, Home: 0, End: nav.length - 1 }[e.key];
        if (to === null || to === undefined) return;
        e.preventDefault();
        nav[to].focus();
    }

    // ---- a drop target for an item dragged in from outside this list
    beginExternalDrag(payload) {
        if (this.disabled) { this.warnOnce('external-disabled', 'beginExternalDrag: the list is disabled: the drag is ignored'); return; }
        this.$ext = { payload, at: this.items.length };
    }
    externalDragOver(x, y) {
        if (!this.$ext) return false;
        if (!this.acceptExternal) { this.warnOnce('external-accept', 'externalDragOver: accept-external is not set on this pk-sortable: the drop is refused'); return false; }
        const items = this.items, axis = this.axis();
        const at = dropIndex(items.map(it => mid(it, axis)), axis === 'y' ? y : x);
        this.$ext.at = at;
        this.mark(items);
        const before = items[at];
        if (before) before.setAttribute('drop-indicator', 'before');
        else items[items.length - 1]?.setAttribute('drop-indicator', 'after');
        this.dragging = true;
        return true;
    }
    endExternalDrag(commit = true) {
        const ctx = this.$ext;
        this.$ext = null;
        this.dragging = false;
        this.mark(this.items);
        if (!ctx) return null;
        if (!commit) { this.say('Drop cancelled.'); return null; }
        if (!this.acceptExternal) { this.warnOnce('external-accept', 'endExternalDrag: accept-external is not set on this pk-sortable: the drop is refused'); return null; }
        this.say(`Item added at position ${ctx.at + 1} of ${this.items.length + 1}.`);
        this.emit('pk-reorder', { order: null, item: null, from: null, to: ctx.at, external: true, payload: ctx.payload }, { cancelable: false });
        return ctx.at;
    }

    updated() {
        this.aria({ role: 'list', ariaLabel: this.label || null });
        const items = this.items;
        const current = items.find(i => i.tabIndex === 0 && !i.disabled) ?? items.find(i => !i.disabled) ?? items[0];
        for (const it of items) it.tabIndex = it === current ? 0 : -1;
    }
};
