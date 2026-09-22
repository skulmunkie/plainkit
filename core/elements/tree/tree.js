// Plainkit tree logic: keyboard navigation over the visible nodes (WAI-ARIA treeview pattern) and type-ahead. Pure functions.
// A node is { id, label, level, expandable, expanded, parent } where parent is the index of the parent in the same visible list
// (-1 for a root). The element flattens its slotted nodes to this list, calls treeKey, and applies the returned action.

// The visible nodes of a nested structure [{ id, label, children?, expanded? }], in order, with level and parent index filled in.
export function flattenTree(nodes, level = 1, parent = -1, out = []) {
    for (const n of nodes) {
        const index = out.length;
        const expandable = Array.isArray(n.children) && n.children.length > 0;
        out.push({ id: n.id, label: n.label ?? String(n.id), level, expandable, expanded: !!n.expanded, parent });
        if (expandable && n.expanded) flattenTree(n.children, level + 1, index, out);
    }
    return out;
}

// What a key does at `index`: { action: 'focus' | 'expand' | 'collapse' | 'select', index } or null for a key the tree ignores.
export function treeKey(items, index, key) {
    const cur = items[index];
    if (!cur) return items.length ? { action: 'focus', index: 0 } : null;
    switch (key) {
        case 'ArrowDown': return index < items.length - 1 ? { action: 'focus', index: index + 1 } : null;
        case 'ArrowUp': return index > 0 ? { action: 'focus', index: index - 1 } : null;
        case 'Home': return { action: 'focus', index: 0 };
        case 'End': return { action: 'focus', index: items.length - 1 };
        case 'ArrowRight':
            if (!cur.expandable) return null;
            return cur.expanded ? { action: 'focus', index: index + 1 } : { action: 'expand', index };
        case 'ArrowLeft':
            if (cur.expandable && cur.expanded) return { action: 'collapse', index };
            return cur.parent >= 0 ? { action: 'focus', index: cur.parent } : null;
        case 'Enter':
        case ' ': return { action: 'select', index };
        default: return null;
    }
}

// Type-ahead: the next node after `index` (wrapping) whose label starts with `text`, case-insensitive; -1 when none.
export function typeahead(items, index, text) {
    const q = text.toLowerCase();
    if (!q) return -1;
    for (let step = 1; step <= items.length; step++) {
        const i = (index + step) % items.length;
        if (items[i].label.toLowerCase().startsWith(q)) return i;
    }
    return -1;
}

// aria-level, aria-setsize and aria-posinset for each visible node (setsize counts siblings under the same parent).
export function ariaPositions(items) {
    return items.map((n, i) => {
        const sibs = items.map((m, j) => [m, j]).filter(([m]) => m.parent === n.parent && m.level === n.level);
        return { level: n.level, setsize: sibs.length, posinset: sibs.findIndex(([, j]) => j === i) + 1 };
    });
}

export default Base => class extends Base {
    connected() {
        if (this.$k) return;
        this.$k = e => this.onKey(e);
        this.addEventListener('keydown', this.$k);
        this.addEventListener('pk-select', e => { if (e.target !== this) this.choose(e.target); });
        this.addEventListener('pk-toggle', e => { if (e.target !== this) { this.$nodes = null; this.requestUpdate(); } });
        this.watchSlot('', () => { this.$nodes = null; this.requestUpdate(); });
        this.$text = ''; this.$timer = 0;
        this.$nodes = null; this.$current = null; this.$currentIndex = -1;
    }
    // Visible items in document order with the fields the pure logic needs. Cached: a full DOM walk is O(n) over every slotted
    // descendant, so recomputing it on every keydown made a keyboard step O(n) at scale (issue #136). The cache is invalidated
    // only on a structural change (slot mutation, or an expand/collapse through pk-toggle), never on plain focus movement.
    get nodes() {
        if (this.$nodes) return this.$nodes;
        const out = []; const walk = (el, level, parent) => {
            for (const it of Array.from(el.children).filter(c => c.localName === 'pk-tree-item')) {
                const kids = Array.from(it.children).filter(c => c.localName === 'pk-tree-item');
                const idx = out.length;
                out.push({ el: it, id: it.value || it.label, label: it.label, level, expandable: kids.length > 0, expanded: it.expanded, parent });
                if (kids.length && it.expanded) walk(it, level + 1, idx);
            }
        };
        walk(this, 1, -1);
        this.$nodes = out;
        return out;
    }
    choose(item) {
        if (this.selection === 'none' || item.disabled) return;
        this.value = item.value || item.label;
        this.requestUpdate();
    }
    onKey(e) {
        const items = this.nodes;
        // The common case (arrow-key repeat with no structural change since the last focus move) is an O(1) lookup of the
        // current item's index instead of a scan; a stale or missing cached index (a click, or a change to items) falls back to one.
        const i = (this.$currentIndex >= 0 && items[this.$currentIndex]?.el === e.target) ? this.$currentIndex : items.findIndex(n => n.el === e.target);
        if (i < 0 || e.ctrlKey || e.metaKey || e.altKey) return;
        let act = treeKey(items, i, e.key);
        if (!act && e.key.length === 1) { clearTimeout(this.$timer); this.$text += e.key; this.$timer = setTimeout(() => { this.$text = ''; }, 500); const j = typeahead(items, i, this.$text); if (j >= 0) act = { action: 'focus', index: j }; }
        if (!act) return;
        e.preventDefault();
        const t = items[act.index].el;
        if (act.action === 'focus') { this.focusItem(t, act.index); return; }
        if (act.action === 'select') { t.select(); return; }
        t.setExpanded(act.action === 'expand');
    }
    // Roving tabindex: move it between the previous current item and the new one instead of rewriting every item's tabIndex.
    focusItem(item, index = -1) {
        if (this.$current && this.$current !== item) this.$current.tabIndex = -1;
        item.tabIndex = 0;
        this.$current = item;
        this.$currentIndex = index >= 0 ? index : this.nodes.findIndex(n => n.el === item);
        item.focus();
    }
    updated() {
        this.aria({ role: 'tree', ariaLabel: this.label || null });
        const all = Array.from(this.querySelectorAll('pk-tree-item'));
        // Items parsed before pk-tree-item is defined are not upgraded yet (no aria(), no props): wait for the definition, then update again.
        if (all.some(it => typeof it.aria !== 'function')) { customElements.whenDefined('pk-tree-item').then(() => this.requestUpdate()); return; }
        const items = this.nodes, pos = ariaPositions(items);
        for (const it of all) { const sel = this.selection !== 'none' && this.value !== '' && (it.value || it.label) === this.value; if (it.selected !== sel) it.selected = sel; }
        const cur = items.find(n => n.el.tabIndex === 0) ?? items.find(n => n.el.selected) ?? items[0];
        for (const n of all) n.tabIndex = -1;
        if (cur) { cur.el.tabIndex = 0; this.$current = cur.el; this.$currentIndex = items.indexOf(cur); }
        items.forEach((n, i) => n.el.aria({ role: 'treeitem', ariaLevel: String(pos[i].level), ariaSetSize: String(pos[i].setsize), ariaPosInSet: String(pos[i].posinset), ariaExpanded: n.expandable ? String(n.expanded) : null, ariaSelected: this.selection === 'none' ? null : String(n.el.selected) }));
    }
};
