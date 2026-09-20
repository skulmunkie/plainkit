import { place, unplace } from '../../js/positioning.js';
import { moveFocus, checkedAfter, safeLink } from '../../js/menu-logic.js';

// pk-menu-item: a row of a dropdown or context menu. It carries its own role and state, activates on click, Enter or Space, and opens a slotted submenu.
const ROLE = { item: 'menuitem', checkbox: 'menuitemcheckbox', radio: 'menuitemradio', header: 'presentation', divider: 'separator' };
const subRows = el => el.slotted('submenu').filter(i => i.localName === 'pk-menu-item' && !i.disabled && !['header', 'divider'].includes(i.type));
export default Base => class extends Base {
    connected() {
        if (!this.$w) {
            this.$w = true; this.$s = { buffer: '', at: 0 };
            this.addEventListener('click', e => { if (e.target.closest('pk-menu-item') === this) this.activate(); });
            this.addEventListener('keydown', e => this.key(e));
            this.addEventListener('pointerover', e => { if (e.pointerType === 'mouse' && e.target.closest('pk-menu-item') === this && !this.disabled) { this.focus({ preventScroll: true }); if (this.hasAttribute('has-submenu')) this.open = true; } });
            this.watchSlot('submenu', () => this.toggleAttribute('has-submenu', this.slotted('submenu').length > 0));
        }
        this.toggleAttribute('has-submenu', this.slotted('submenu').length > 0);
        if (this.type !== 'header' && this.type !== 'divider' && !this.hasAttribute('tabindex')) this.tabIndex = -1;
    }
    changed(name) { if (name === 'open') this.layer(); }
    updated() {
        this.aria({ role: ROLE[this.type] ?? 'menuitem', ariaChecked: this.type === 'checkbox' || this.type === 'radio' ? String(this.checked) : null, ariaDisabled: this.disabled ? 'true' : null, ariaHasPopup: this.hasAttribute('has-submenu') ? 'menu' : null, ariaExpanded: this.hasAttribute('has-submenu') ? String(this.open) : null });
    }
    layer() {
        const sub = this.part('submenu');
        if (!sub) return;
        if (this.open && !globalThis.matchMedia('(max-width: 640px)').matches) place(this, sub, { placement: 'right-start', offset: 0 });
        else unplace(sub);
    }
    activate() {
        if (this.disabled || this.type === 'header' || this.type === 'divider') return;
        if (this.hasAttribute('has-submenu')) { this.open = true; subRows(this)[0]?.focus({ preventScroll: true }); return; }
        const checked = checkedAfter(ROLE[this.type], this.checked);
        if (this.type === 'radio') { for (const r of this.parentElement?.children ?? []) if (r.localName === 'pk-menu-item' && r.type === 'radio') r.checked = r === this; }
        else if (this.type === 'checkbox') this.checked = checked;
        const go = safeLink(this.href);
        if (this.emit('pk-select', { item: this, value: this.value || this.textContent.trim(), checked }) && go) location.assign(go);
    }
    key(e) {
        if (e.target.closest('pk-menu-item') !== this) {
            // A key inside the submenu: move among its rows, Left / Escape return to this row.
            if (e.key === 'ArrowLeft' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.open = false; this.focus({ preventScroll: true }); return; }
            moveFocus(e, subRows(this), this.$s);
            if (e.defaultPrevented) e.stopPropagation();
            return;
        }
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.activate(); }
        else if (e.key === 'ArrowRight' && this.hasAttribute('has-submenu')) { e.preventDefault(); e.stopPropagation(); this.activate(); }
    }
};
