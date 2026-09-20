import { place } from '../../js/positioning.js';

// Tooltip logic: when a tooltip appears. Pure, so it can be tested without a DOM.
export const DEFAULT_DELAY = 400;
export const LONG_PRESS = 500;

// Milliseconds to wait before showing for an input kind.
export function showDelay(kind, configured = DEFAULT_DELAY) {
    if (kind === 'focus') return 0;
    if (kind === 'touch') return LONG_PRESS;
    return Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_DELAY;
}

// pk-tooltip wraps its target: hover shows it after `delay`, focus at once, a touch long press after LONG_PRESS; Escape, leaving or scrolling hides it.
// The text also lives in a hidden light-DOM node the target points at with aria-describedby (ids do not cross the shadow boundary).
const ids = { n: 0 };
export default Base => class extends Base {
    connected() {
        if (!this.$w) {
            this.$w = true;
            const on = (t, f) => this.addEventListener(t, f);
            on('pointerover', e => { if (e.pointerType === 'mouse') this.schedule('hover'); });
            on('pointerout', e => { if (this.contains(e.relatedTarget)) return; if (this.interactive && e.pointerType === 'mouse') { clearTimeout(this.$t); this.$t = setTimeout(() => { if (!this.matches(':hover')) this.hide(); }, 150); } else this.hide(); });
            on('focusin', () => { if (!this.$down) this.schedule('focus'); });
            on('focusout', e => { if (this.interactive && (this.contains(e.relatedTarget) || this.shadowRoot.contains(e.relatedTarget))) return; this.hide(); });
            on('pointerdown', e => { this.$down = true; if (this.interactive && e.pointerType === 'touch') { if (e.composedPath().includes(this.part('tip'))) return; if (this.shown) this.hide(); else this.show(); return; } if (this.interactive && this.shown && e.composedPath().includes(this.part('tip'))) return; if (e.pointerType === 'touch') this.schedule('touch'); else this.hide(); });
            const up = () => { this.$down = false; if (!this.shown) clearTimeout(this.$t); };
            on('pointerup', up); on('pointercancel', up);
            on('keydown', e => { if (e.key === 'Escape') this.hide(); });
            this.$hide = () => this.hide();
            this.watchSlot('content', () => { if (this.shown) place(this, this.part('tip'), { placement: this.placement, offset: 6 }); });
        }
        this.describe();
    }
    disconnected() { clearTimeout(this.$t); this.hide(); }
    changed(name) { if (name === 'text') this.describe(); }
    describe() {
        if (this.help) return;
        const target = this.slotted()[0];
        if (!target || !this.text) return;
        if (!this.$d || !this.$d.isConnected) { this.$d = document.createElement('span'); this.$d.hidden = true; this.$d.id = `pk-tip-${++ids.n}`; this.append(this.$d); }
        this.$d.textContent = this.text;
        target.setAttribute('aria-describedby', this.$d.id);
    }
    schedule(kind) { clearTimeout(this.$t); this.$t = setTimeout(() => this.show(), showDelay(kind, this.delay)); }
    show() {
        if (this.shown || (!this.text && !this.slotted('content').length)) return;
        this.shown = true;
        place(this, this.part('tip'), { placement: this.placement, offset: 6 });
        addEventListener('scroll', this.$hide, true);
        this.emit('pk-show', null);
    }
    hide() {
        clearTimeout(this.$t);
        if (!this.shown) return;
        this.shown = false;
        removeEventListener('scroll', this.$hide, true);
        this.emit('pk-hide', null);
    }
};
