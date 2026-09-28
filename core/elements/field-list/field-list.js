// A generated row shows unless explicitly hidden, or its value is empty (null, undefined or '') and showEmpty is not set. Pure so it is
// testable without a DOM (issue #207: an optional row that hides itself when there is nothing to show).
export function rowVisible(item, showEmpty) {
    if (item?.hidden) return false;
    const value = item?.value;
    const empty = value == null || value === '';
    return showEmpty || !empty;
}

export default Base => class extends Base {
    connected() { this.watchSlot('heading', () => this.requestUpdate()); }
    changed(name) { if (name === 'items' || name === 'showEmpty') this.requestUpdate(); }
    updated() {
        this.part('heading').hidden = !this.heading && this.slotted('heading').length === 0;
        this.paint();
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
            const dt = row.querySelector('[part="term"]'), dd = row.querySelector('[part="value"]'), a = row.querySelector('[part="value-link"]');
            const text = item.value ?? '';
            dt.textContent = item.label ?? '';
            if (item.href) { a.href = item.href; a.textContent = text; a.hidden = false; }
            else { a.remove(); dd.textContent = text; }
            box.append(dt, dd);
        }
    }
};
