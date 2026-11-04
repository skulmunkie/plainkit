import { safeHref } from '../../js/safe-url.js';

export default Base => class extends Base {
    connected() { for (const s of ['portrait', 'name', 'role', 'rating']) this.watchSlot(s, () => this.requestUpdate()); }
    updated() {
        const link = this.part('source'), href = safeHref(this.cite);
        if (this.cite && !href) this.warnOnce('cite', `cite=${JSON.stringify(this.cite)} is not a same-site path or http(s) address: the quote has no source link`, { cite: this.cite });
        if (href) link.setAttribute('href', href); else link.removeAttribute('href');
        link.hidden = !href;
        this.part('caption').hidden = !href && ['portrait', 'name', 'role', 'rating'].every(s => this.slotted(s).length === 0);
    }
};
