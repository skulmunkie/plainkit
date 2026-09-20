import { place, autoUpdate, onOutside } from '../../js/positioning.js';

// Popover logic: the open/close state machine. Pure, so it can be tested without a DOM.
export const HOVER_DELAY = 200;

export function nextPopoverState(open, event) {
    switch (event) {
        case 'toggle': return !open;
        case 'open': return true;
        case 'close': case 'escape': case 'outside': case 'blur': case 'confirm': case 'cancel': return false;
        default: return open;
    }
}

// A hover popover closes only when the pointer is over neither the trigger nor the panel.
export const hoverShouldClose = (overTrigger, overPanel) => !overTrigger && !overPanel;

// pk-popover: a non-modal panel anchored to the slotted trigger; variant="confirm" adds Cancel and Confirm.
export default Base => class extends Base {
    connected() {
        if (!this.$w) {
            this.$w = true;
            this.addEventListener('click', e => { if (this.triggerEl?.contains(e.target) && this.trigger !== 'hover' && this.trigger !== 'manual') { this.$kb = e.detail === 0; if (this.open) this.request('toggle'); else this.open = true; } });
            this.part('panel').addEventListener('click', e => {
                const a = e.target.closest?.('[data-action]')?.getAttribute('data-action');
                if (a === 'confirm') { this.emit('pk-confirm', null); this.request('confirm'); } else if (a === 'cancel') this.request('cancel');
            });
            this.addEventListener('focusout', e => { if (this.open && e.relatedTarget && !this.contains(e.relatedTarget) && !this.shadowRoot.contains(e.relatedTarget)) this.request('blur'); });
            this.addEventListener('pointerover', e => { if (this.trigger === 'hover' && e.pointerType === 'mouse') { clearTimeout(this.$t); if (!this.open) this.$t = setTimeout(() => { this.open = true; }, HOVER_DELAY); } });
            this.addEventListener('pointerout', e => { if (this.trigger === 'hover' && !this.contains(e.relatedTarget)) { clearTimeout(this.$t); this.$t = setTimeout(() => { if (this.open && hoverShouldClose(this.matches(':hover'), false)) this.request('outside'); }, HOVER_DELAY); } });
            this.watchSlot('trigger', () => this.aria2());
        }
        this.aria2(); this.apply();
    }
    disconnected() { this.stop(); clearTimeout(this.$t); }
    get triggerEl() { return this.slotted('trigger')[0]; }
    aria2() { this.triggerEl?.setAttribute('aria-expanded', String(this.open)); this.triggerEl?.setAttribute('aria-haspopup', 'dialog'); }
    changed(name) { if (name === 'open') this.apply(); }
    show() { this.open = true; }
    hide() { this.open = false; }
    toggle() { this.open = !this.open; }
    request(reason) {
        if (!this.emit('pk-close', { reason })) return;
        const had = this.shadowRoot.contains(this.shadowRoot.activeElement) || this.contains(document.activeElement);
        this.open = false;
        if (had && reason !== 'outside' && reason !== 'blur') this.triggerEl?.focus({ preventScroll: true });
    }
    apply() {
        this.stop(); this.aria2();
        const panel = this.part('panel');
        panel.setAttribute('role', this.variant === 'confirm' ? 'alertdialog' : 'dialog');
        if (!this.open) return;
        const options = { placement: this.placement, offset: 6 };
        place(this.triggerEl ?? this, panel, options);
        this.$u = autoUpdate(this.triggerEl ?? this, panel, options);
        this.$o = onOutside([this], e => this.request(e.type === 'keydown' ? 'escape' : 'outside'));
        if (this.$kb || this.variant === 'confirm') (panel.querySelector('[part="cancel"], button, input') ?? panel).focus({ preventScroll: true });
        this.$kb = false;
        this.emit('pk-open', null);
    }
    stop() { this.$u?.(); this.$o?.(); this.$u = this.$o = null; }
};
