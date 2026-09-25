import { place, autoUpdate, onOutside } from '../../js/positioning.js';
import { mediaBelow } from '../../js/breakpoints.js';

// pk-badge-popover: a pill that is a disclosure button; its panel (heading, details, actions) opens under it. Mirrors pk-popover's state machine.
export default Base => class extends Base {
    connected() {
        if (!this.$w) {
            this.$w = true;
            this.part('trigger').addEventListener('click', e => { this.$kb = e.detail === 0; if (this.open) this.request('toggle'); else this.open = true; });
            this.part('panel').addEventListener('click', e => { if (e.target.closest?.('[data-close]')) this.request('action'); });
            this.addEventListener('focusout', e => { if (this.open && e.relatedTarget && !this.contains(e.relatedTarget)) this.request('blur'); });
            this.watchSlot('actions', () => this.requestUpdate());
        }
        this.apply();
    }
    disconnected() { this.stop(); }
    updated() {
        const panel = this.part('panel');
        if (this.heading) { panel.setAttribute('aria-labelledby', 'h'); panel.removeAttribute('aria-label'); } else { panel.removeAttribute('aria-labelledby'); panel.setAttribute('aria-label', this.label || [...this.childNodes].filter(n => !n.slot).map(n => n.textContent).join('').trim()); }
        this.part('trigger').setAttribute('aria-expanded', String(this.open));
        this.part('actions').hidden = this.slotted('actions').length === 0;
    }
    changed(name) { if (name === 'open') this.apply(); }
    show() { this.open = true; }
    hide() { this.open = false; }
    toggle() { this.open = !this.open; }
    request(reason) {
        if (!this.emit('pk-close', { reason })) return;
        const had = this.shadowRoot.contains(this.shadowRoot.activeElement) || this.contains(document.activeElement);
        this.open = false;
        if (had && reason !== 'outside' && reason !== 'blur') this.part('trigger').focus({ preventScroll: true });
    }
    apply() {
        this.stop();
        this.part('trigger').setAttribute('aria-expanded', String(this.open));
        if (!this.open) return;
        const panel = this.part('panel'), pill = this.part('trigger');
        // A phone: anchor to a box as wide as the viewport, centred, so the panel (its CSS width is the viewport less the gutters) starts at the gutter.
        const phone = mediaBelow('phone').matches;
        const anchor = phone ? { getBoundingClientRect: () => { const r = pill.getBoundingClientRect(), w = document.documentElement.clientWidth; return { left: 0, right: w, top: r.top, bottom: r.bottom, width: w, height: r.height }; } } : pill;
        const options = { placement: phone ? 'bottom' : this.placement, offset: 6 };
        place(anchor, panel, options);
        this.$u = autoUpdate(anchor, panel, options);
        this.$o = onOutside([this], e => this.request(e.type === 'keydown' ? 'escape' : 'outside'));
        if (this.$kb) (this.querySelector('[slot="actions"], [slot="details"] a[href], [slot="details"] button') ?? panel).focus({ preventScroll: true });
        this.$kb = false;
        this.emit('pk-open', null);
    }
    stop() { this.$u?.(); this.$o?.(); this.$u = this.$o = null; }
};
