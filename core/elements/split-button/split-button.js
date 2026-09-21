// pk-split-button behaviour: a main action beside a caret that opens a menu of related actions (the menu slot's buttons). The pure helpers are exported for the Node tests.
// Index of the item a menu key moves to, or null for a key the menu ignores.
export function nextMenuIndex(current, count, key) {
    if (count === 0) return null;
    switch (key) {
        case 'ArrowDown': return current < 0 ? 0 : (current + 1) % count;
        case 'ArrowUp': return current < 0 ? count - 1 : (current - 1 + count) % count;
        case 'Home': return 0;
        case 'End': return count - 1;
        default: return null;
    }
}
// "top" when the menu does not fit below the caret and there is more room above; otherwise "bottom".
export const placementFor = (spaceBelow, spaceAbove, menuHeight) => (spaceBelow < menuHeight && spaceAbove > spaceBelow ? 'top' : 'bottom');

export default Base => class extends Base {
    connected() { this.setup(); if (this.open) document.addEventListener('click', this.$out, true); }
    setup() {
        if (this.$init) return;
        this.$init = true;
        this.part('toggle').addEventListener('click', () => { this.open = !this.open; });
        this.part('main').addEventListener('click', () => { if (this.type === 'submit') this.form?.requestSubmit(); else if (this.type === 'reset') this.form?.reset(); });
        this.addEventListener('keydown', e => this.keys(e));
        this.addEventListener('click', e => {
            const item = e.target.closest?.('[slot="menu"]');
            if (!item || !this.items().includes(item)) return;
            this.emit('pk-split-select', { value: item.value || item.getAttribute('data-value') || '', label: item.textContent.trim() });
            this.open = false; this.part('toggle').focus();
        });
        this.$out = e => { if (!e.composedPath().includes(this)) this.open = false; };
    }
    disconnected() { document.removeEventListener('click', this.$out, true); }
    items() { return this.slotted('menu').filter(e => !e.disabled); }
    changed(name, v) { if (name === 'open') { if (v) document.addEventListener('click', this.$out, true); else document.removeEventListener('click', this.$out, true); this.emit('pk-menu-toggle', { open: v }); } }
    updated() {
        const menu = this.part('menu');
        menu.hidden = !this.open;
        this.part('toggle').setAttribute('aria-expanded', String(this.open));
        for (const i of this.slotted('menu')) i.setAttribute('role', 'menuitem');
        if (this.open) { const t = this.part('toggle').getBoundingClientRect(); const h = menu.getBoundingClientRect().height; menu.dataset.placement = placementFor(innerHeight - t.bottom, t.top, h); }
    }
    keys(e) {
        const items = this.items(); const at = items.indexOf(e.target.closest?.('[slot="menu"]') ?? null);
        if (e.key === 'Escape' && this.open) { e.preventDefault(); e.stopPropagation(); this.open = false; this.part('toggle').focus(); return; }
        if (e.key === 'Tab') { this.open = false; return; }
        const onToggle = e.composedPath()[0] === this.part('toggle');
        if (onToggle && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); this.open = true; this.updateComplete_(() => items[e.key === 'ArrowDown' ? 0 : items.length - 1]?.focus()); return; }
        if (at < 0) return;
        const next = nextMenuIndex(at, items.length, e.key);
        if (next === null) return;
        e.preventDefault(); items[next].focus();
    }
    updateComplete_(fn) { queueMicrotask(() => queueMicrotask(fn)); }
    show() { this.open = true; }
    hide() { this.open = false; }
};
