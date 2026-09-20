import { scrollProgress } from '../../js/scroll-aids.js';

// pk-scroll-progress: sets --pk-progress (0 to 1) from the window, or from the element named by `for`.
export default Base => class extends Base {
    connected() { this.$f = () => this.measure(); this.bind(); this.measure(); }
    disconnected() { this.unbind(); }
    changed(name) { if (name === 'for' && this.isConnected) { this.unbind(); this.bind(); this.measure(); } }
    get scrollerEl() { return this.for ? document.querySelector(this.for) : null; }
    bind() { this.$t = this.scrollerEl ?? window; this.$t.addEventListener('scroll', this.$f, { passive: true }); window.addEventListener('resize', this.$f); }
    unbind() { this.$t?.removeEventListener('scroll', this.$f); window.removeEventListener('resize', this.$f); }
    measure() {
        const s = this.scrollerEl ?? document.scrollingElement;
        this.style.setProperty('--pk-progress', String(scrollProgress(s.scrollTop, s.scrollHeight, this.scrollerEl ? s.clientHeight : innerHeight)));
    }
};
