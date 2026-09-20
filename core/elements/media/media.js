export default Base => class extends Base {
    connected() {
        if (this.$c) return;
        const open = () => { const m = this.slotted().find(e => e.localName === 'img' || e.localName === 'video' || e.localName === 'picture'); const img = m?.localName === 'picture' ? m.querySelector('img') : m; this.emit('pk-open', { src: img?.currentSrc || img?.src || '', alt: img?.alt || '', caption: this.caption }); };
        this.$c = () => { if (this.lightbox) open(); };
        this.$k = e => { if (this.lightbox && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(); } };
        this.part('box').addEventListener('click', this.$c);
        this.part('box').addEventListener('keydown', this.$k);
        this.watchSlot('caption', () => this.requestUpdate());
    }
    updated() {
        this.part('caption').hidden = !this.caption && this.slotted('caption').length === 0;
        this.style.setProperty('--_r', this.ratio.replace('/', ' / '));
        const box = this.part('box');
        if (this.lightbox) { box.setAttribute('role', 'button'); box.tabIndex = 0; box.setAttribute('aria-label', this.caption ? `Enlarge: ${this.caption}` : 'Enlarge image'); }
        else { box.removeAttribute('role'); box.removeAttribute('tabindex'); box.removeAttribute('aria-label'); }
    }
};
