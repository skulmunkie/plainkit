import { place, autoUpdate, onOutside, unplace } from '../../js/positioning.js';
import { moveFocus } from '../../js/menu-logic.js';

// pk-dropdown: a menu opened from a slotted trigger. Items are pk-menu-item children. The menu layer is fixed and placed beside the trigger.
const rows = el => el.slotted().filter(i => i.localName === 'pk-menu-item' && !['header', 'divider'].includes(i.type) && !i.disabled);
export default Base => class extends Base {
    connected() {
        if (!this.$w) {
            this.$w = true; this.$s = { buffer: '', at: 0 };
            this.addEventListener('click', e => {
                const t = this.trigger;
                if (t && t.contains(e.target)) { this.$kb = e.detail === 0; this.request(this.open ? 'toggle' : null); return; }
            });
            this.addEventListener('pk-select', () => { if (!this.keepOpen && this.open) this.request('select'); });
            this.addEventListener('keydown', e => this.key(e));
            this.watchSlot('trigger', () => this.aria2());
        }
        this.aria2(); this.apply();
    }
    disconnected() { this.stop(); }
    get trigger() { return this.slotted('trigger')[0]; }
    aria2() { const t = this.trigger; if (t) { t.setAttribute('aria-haspopup', 'menu'); t.setAttribute('aria-expanded', String(this.open)); } }
    changed(name) { if (name === 'open') this.apply(); }
    show() { this.open = true; }
    hide() { this.open = false; }
    request(reason) {
        if (reason === null) { this.open = true; return; }
        if (this.emit('pk-close', { reason })) { this.open = false; if (reason !== 'outside') this.trigger?.focus({ preventScroll: true }); }
    }
    apply() {
        const menu = this.part('menu');
        this.stop(); this.aria2();
        if (!this.open) { unplace(menu); return; }
        const t = this.trigger; const options = { placement: this.placement, offset: 4 };
        if (t) { place(t, menu, options); this.$u = autoUpdate(t, menu, options); }
        this.$o = onOutside([this], e => this.request(e.type === 'keydown' ? 'escape' : 'outside'));
        if (this.$kb) rows(this)[0]?.focus({ preventScroll: true });
        this.$kb = false;
        this.emit('pk-open', {});
    }
    stop() { this.$u?.(); this.$o?.(); this.$u = this.$o = null; }
    key(e) {
        const t = this.trigger;
        if (t && t.contains(e.target)) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); this.open = true; const r = rows(this); (e.key === 'ArrowUp' ? r[r.length - 1] : r[0])?.focus({ preventScroll: true }); }
            return;
        }
        if (!this.open) return;
        if (e.key === 'Tab') { this.request('tab'); return; }
        moveFocus(e, rows(this), this.$s);
    }
};
