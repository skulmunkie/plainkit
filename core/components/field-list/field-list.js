// A generated row shows unless explicitly hidden, or its value is empty (null, undefined or '') and showEmpty is not set. Pure so it is
// testable without a DOM (issue #207: an optional row that hides itself when there is nothing to show).
export function rowVisible(item, showEmpty) {
    if (item?.hidden) return false;
    const value = item?.value;
    const empty = value == null || value === '';
    return showEmpty || !empty;
}

// A slotted dt whose dd (every dd up to the next dt) has no element and no text is an empty pair (issue 801: an optional row that hides itself). Pure over a list of elements.
export function emptyPairs(children) {
    const out = []; let dt = null, dds = [];
    const close = () => { if (dt && dds.length && dds.every(d => !d.children.length && !d.textContent.trim())) out.push(dt, ...dds); };
    for (const c of children) { if (c.localName === 'dt') { close(); dt = c; dds = []; } else if (c.localName === 'dd') dds.push(c); }
    close();
    return out;
}

export default Base => class extends Base {
    connected() {
        this.watchSlot('heading', () => this.requestUpdate()); this.watchSlot('', () => this.requestUpdate());
        this.$mo ??= new MutationObserver(() => this.requestUpdate());
        this.$mo.observe(this, { childList: true, subtree: true, characterData: true });
    }
    disconnected() { this.$mo?.disconnect(); }
    changed(name) { if (name === 'items' || name === 'showEmpty') this.requestUpdate(); }
    updated() {
        this.part('heading').hidden = !this.heading && this.slotted('heading').length === 0;
        this.paint();
        this.prune();
    }
    // Hides the slotted dt/dd pairs with nothing to show, unless showEmpty is set; only a hidden attribute this element set is ever taken off again.
    prune() {
        const empty = new Set(this.showEmpty ? [] : emptyPairs(this.slotted()));
        for (const c of this.slotted()) { if (empty.has(c)) { if (!c.hidden) { c.hidden = true; (this.$hid ??= new Set()).add(c); } } else if (this.$hid?.delete(c)) c.hidden = false; }
    }
    // Renders items into the shadow dt/dd pairs alongside the slot; slotted dt/dd keep working unchanged. Text only: values are set with
    // textContent, never parsed as markup, so a strict module (no dt/dd it can write) still gets a real description list.
    paint() {
        const box = this.part('items');
        box.replaceChildren();
        const items = Array.isArray(this.items) ? this.items : [];
        const tpl = this.shadowRoot.querySelector('template');
        for (const item of items) {
            if (!rowVisible(item, this.showEmpty)) continue;
            const row = tpl.content.cloneNode(true);
            const dt = row.querySelector('[part="term"]');
            const dd = row.querySelector('[part="value"]');
            const a = row.querySelector('[part="value-link"]');
            const text = item.value ?? '';
            dt.textContent = item.label ?? '';
            if (item.href) { a.href = item.href; a.textContent = text; a.hidden = false; }
            else { a.remove(); dd.textContent = text; }
            box.append(dt, dd);
        }
    }
};
