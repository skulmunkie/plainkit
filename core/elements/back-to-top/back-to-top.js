import { showBackToTop, scrollBehavior } from '../../js/scroll-aids.js';

// pk-back-to-top: appears past `threshold` px and scrolls the window (or `for`) back to the top, then moves focus there.
export default Base => class extends Base {
    connected() {
        if (!this.$w) { this.$w = true; this.part('button').addEventListener('click', () => this.top()); }
        this.$f = () => { this.visible = showBackToTop((this.scrollerEl ?? document.scrollingElement).scrollTop, this.threshold); };
        this.$t = this.scrollerEl ?? window; this.$t.addEventListener('scroll', this.$f, { passive: true }); this.$f();
    }
    disconnected() { this.$t?.removeEventListener('scroll', this.$f); }
    get scrollerEl() { return this.for ? document.querySelector(this.for) : null; }
    top() {
        const s = this.scrollerEl ?? window;
        s.scrollTo({ top: 0, behavior: scrollBehavior(globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches) });
        const home = document.querySelector('[data-scroll-top], main, body'); home?.setAttribute?.('tabindex', home.getAttribute('tabindex') ?? '-1'); home?.focus({ preventScroll: true });
    }
};
