import { place, onOutside, unplace } from '../../js/positioning.js';
import { moveFocus } from '../../js/menu-logic.js';

// pk-context-menu: a menu opened at the pointer (right click), at the focused element (Shift+F10 or the Menu key), or by a 500ms touch press.
const rows = el => el.slotted('menu').filter(i => i.localName === 'pk-menu-item' && !i.disabled && !['header', 'divider'].includes(i.type));
export default Base => class extends Base {
    connected() { this.setup(); if (this.open && !this.$o) this.arm(); }
    arm() { this.$o = onOutside([this], e => this.request(e.type === 'keydown' ? 'escape' : 'outside')); }
    setup() {
        if (!this.$w) {
            this.$w = true; this.$s = { buffer: '', at: 0 };
            this.addEventListener('contextmenu', e => { if (this.disabled || e.target.closest('[slot="menu"]')) return; e.preventDefault(); this.showAt(e.clientX, e.clientY, false); });
            this.addEventListener('keydown', e => {
                if (this.open) { if (e.key === 'Tab') this.request('tab'); else moveFocus(e, rows(this), this.$s); return; }
                if (!this.disabled && ((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu')) { e.preventDefault(); const r = e.target.getBoundingClientRect(); this.showAt(r.left, r.bottom, true); }
            });
            this.addEventListener('pointerdown', e => { if (e.pointerType === 'touch' && !this.disabled) this.$t = setTimeout(() => { this.$swallow = true; this.showAt(e.clientX, e.clientY, false); }, 500); });
            for (const t of ['pointerup', 'pointercancel', 'pointermove']) this.addEventListener(t, () => clearTimeout(this.$t));
            this.addEventListener('pk-select', () => this.open && this.request('select'));
        }
    }
    disconnected() { this.stop(); clearTimeout(this.$t); }
    changed(name) { if (name === 'open' && !this.open) { this.stop(); unplace(this.part('menu')); } }
    hide() { this.open = false; }
    showAt(x, y, focusFirst) {
        this.open = true;
        const menu = this.part('menu');
        place({ x, y }, menu, { placement: 'bottom-start', offset: 0 });
        this.stop();
        this.arm();
        if (focusFirst) rows(this)[0]?.focus({ preventScroll: true });
        this.emit('pk-open', { x, y });
    }
    request(reason) { if (this.emit('pk-close', { reason })) this.open = false; }
    stop() { this.$o?.(); this.$o = null; }
};
