export default Base => class extends Base {
    connected() { for (const s of ['actions', 'footer', 'media']) this.watchSlot(s, () => this.requestUpdate()); }
    updated() {
        const link = this.part('link');
        if (this.href) link.setAttribute('href', this.href); else link.removeAttribute('href');
        this.part('header').hidden = !this.heading && this.slotted('actions').length === 0;
        this.part('media').hidden = this.slotted('media').length === 0;
        this.part('footer').hidden = this.slotted('footer').length === 0;
    }
};
